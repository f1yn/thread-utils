import http from 'http';
import finalhandler from 'finalhandler';
import serveStatic from 'serve-static';

export async function serveStaticDirectory(directory: string, port: number) {
	// Serve up public/ftp folder
	const serve = serveStatic(directory, {
		index: ['index.html'],
	});

	// Create server
	const server = http.createServer(function onRequest(req, res) {
		serve(req, res, finalhandler(req, res));
	});

	// Listen;
	server.listen(port);
	console.info('[server] server opened on port', port);
}
