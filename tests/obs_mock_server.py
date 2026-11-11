# 模拟对象存储：静态文件 + CORS + Range（206），用于本地测试播放器。
# 用法：python3 tests/obs_mock_server.py <目录> [端口，默认 8790]
# 目录结构与线上对象存储约定一致（manifest.json、audio/、lyrics/），见 docs/player.md。
import http.server, os, sys, re
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Range")
        self.send_header("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges")
        self.send_header("Accept-Ranges", "bytes")
        super().end_headers()
    def do_OPTIONS(self):
        self.send_response(204); self.end_headers()
    def send_head(self):
        path = self.translate_path(self.path)
        m = re.match(r"bytes=(\d*)-(\d*)", self.headers.get("Range", ""))
        if not m or not os.path.isfile(path): return super().send_head()
        size = os.path.getsize(path)
        start = int(m.group(1)) if m.group(1) else size - int(m.group(2))
        end = int(m.group(2)) if m.group(1) and m.group(2) else size - 1
        end = min(end, size - 1)
        f = open(path, "rb"); f.seek(start)
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(path))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.end_headers()
        self._remaining = end - start + 1
        return f
    def copyfile(self, src, dst):
        n = getattr(self, "_remaining", None)
        if n is None: return super().copyfile(src, dst)
        while n > 0:
            chunk = src.read(min(65536, n))
            if not chunk: break
            dst.write(chunk); n -= len(chunk)
    def log_message(self, *a): pass
http.server.SimpleHTTPRequestHandler.extensions_map[".flac"] = "audio/flac"
http.server.SimpleHTTPRequestHandler.extensions_map[".lrc"] = "text/plain; charset=utf-8"
os.chdir(sys.argv[1])
port = int(sys.argv[2]) if len(sys.argv) > 2 else 8790
print(f"模拟对象存储：http://127.0.0.1:{port}/  （目录 {os.getcwd()}）")
http.server.ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
