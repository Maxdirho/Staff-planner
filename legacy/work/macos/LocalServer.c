#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/select.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <unistd.h>

static const char *content_type(const char *path) {
    const char *ext = strrchr(path, '.');
    if (!ext) return "application/octet-stream";
    if (!strcmp(ext, ".html")) return "text/html; charset=utf-8";
    if (!strcmp(ext, ".js")) return "text/javascript; charset=utf-8";
    if (!strcmp(ext, ".css")) return "text/css; charset=utf-8";
    if (!strcmp(ext, ".png")) return "image/png";
    return "application/octet-stream";
}

static void send_all(int fd, const void *buffer, size_t size) {
    const char *p = buffer;
    while (size) {
        ssize_t sent = send(fd, p, size, 0);
        if (sent <= 0) return;
        p += sent;
        size -= (size_t)sent;
    }
}

static void respond(int client, const char *root) {
    char request[4096] = {0};
    ssize_t n = recv(client, request, sizeof(request) - 1, 0);
    if (n <= 0) return;

    char method[16] = {0}, rawPath[2048] = {0};
    if (sscanf(request, "%15s %2047s", method, rawPath) != 2 || strcmp(method, "GET")) return;
    char *query = strchr(rawPath, '?');
    if (query) *query = '\0';
    if (strstr(rawPath, "..")) return;

    const char *relative = !strcmp(rawPath, "/") ? "index.html" : rawPath + 1;
    char fullPath[4096];
    snprintf(fullPath, sizeof(fullPath), "%s/%s", root, relative);
    int file = open(fullPath, O_RDONLY);
    if (file < 0) {
        const char *body = "Not found";
        char header[256];
        int h = snprintf(header, sizeof(header), "HTTP/1.1 404 Not Found\r\nContent-Length: %zu\r\nConnection: close\r\n\r\n", strlen(body));
        send_all(client, header, (size_t)h); send_all(client, body, strlen(body)); return;
    }
    struct stat st;
    if (fstat(file, &st) != 0) { close(file); return; }
    char header[512];
    int h = snprintf(header, sizeof(header), "HTTP/1.1 200 OK\r\nContent-Type: %s\r\nContent-Length: %lld\r\nCache-Control: no-store, no-cache, must-revalidate\r\nConnection: close\r\n\r\n", content_type(fullPath), (long long)st.st_size);
    send_all(client, header, (size_t)h);
    char buffer[32768];
    while ((n = read(file, buffer, sizeof(buffer))) > 0) send_all(client, buffer, (size_t)n);
    close(file);
}

int main(int argc, char **argv) {
    if (argc != 2) return 2;
    signal(SIGPIPE, SIG_IGN);
    int server = socket(AF_INET, SOCK_STREAM, 0);
    if (server < 0) return 3;
    int yes = 1; setsockopt(server, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(yes));
    struct sockaddr_in address = {0};
    address.sin_family = AF_INET;
    address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    address.sin_port = 0;
    if (bind(server, (struct sockaddr *)&address, sizeof(address)) || listen(server, 16)) return 4;
    socklen_t length = sizeof(address);
    getsockname(server, (struct sockaddr *)&address, &length);
    printf("%u\n", ntohs(address.sin_port)); fflush(stdout);

    pid_t parent = getppid();
    for (;;) {
        fd_set set; FD_ZERO(&set); FD_SET(server, &set);
        struct timeval timeout = {.tv_sec = 1, .tv_usec = 0};
        int ready = select(server + 1, &set, NULL, NULL, &timeout);
        if (getppid() != parent || kill(parent, 0) != 0) break;
        if (ready > 0) {
            int client = accept(server, NULL, NULL);
            if (client >= 0) { respond(client, argv[1]); close(client); }
        }
    }
    close(server);
    return 0;
}
