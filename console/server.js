/**
 * Production entry — buffers every response so it leaves with Content-Length instead of
 * Transfer-Encoding: chunked. Railway's edge has been dropping the terminal chunk of Next's
 * streamed responses (curl exit 56, Chrome ERR_INVALID_CHUNKED_ENCODING on the home page);
 * `compress: false` did not fix it. Streaming HTML buys nothing here — every route is
 * server-rendered on demand and small — so we trade it for responses the edge forwards intact.
 */
const http = require("http");
const next = require("next");

const port = parseInt(process.env.PORT || "8080", 10);
const app = next({ dev: false, hostname: "0.0.0.0", port });
const handle = app.getRequestHandler();

function toBuffer(chunk, enc) {
  if (chunk == null) return null;
  return Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, typeof enc === "string" ? enc : undefined);
}

app.prepare().then(() => {
  http
    .createServer((req, res) => {
      const chunks = [];
      const write = res.write.bind(res);
      const end = res.end.bind(res);
      res.flushHeaders = () => {};               // headers go out with the body, once the length is known
      res.write = (chunk, enc, cb) => {
        const b = toBuffer(chunk, enc);
        if (b) chunks.push(b);
        const done = typeof enc === "function" ? enc : cb;
        if (done) done();
        return true;
      };
      res.end = (chunk, enc, cb) => {
        if (typeof chunk === "function") { cb = chunk; chunk = null; }
        else if (typeof enc === "function") { cb = enc; enc = undefined; }
        const b = toBuffer(chunk, enc);
        if (b) chunks.push(b);
        const body = Buffer.concat(chunks);
        if (!res.headersSent) {
          res.removeHeader("transfer-encoding");
          res.setHeader("Content-Length", body.length);
        }
        if (body.length) write(body);
        return end(cb);
      };
      handle(req, res);
    })
    .listen(port, "0.0.0.0", () => console.log(`> DELPHi console (buffered responses) on http://0.0.0.0:${port}`));
});
