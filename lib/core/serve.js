import http from 'http';
import finalhandler from 'finalhandler';
import serveStatic from 'serve-static';
export async function serveStaticDirectory(directory, port) {
    const serve = serveStatic(directory, {
        index: ['index.html'],
    });
    const server = http.createServer(function onRequest(req, res) {
        serve(req, res, finalhandler(req, res));
    });
    server.listen(port);
    console.info('[server] server opened on port', port);
}
