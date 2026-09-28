const fs = require('fs');
const path = require('path');

const backendRoot = path.resolve(__dirname, '../..');
const dockerfile = fs.readFileSync(
  path.join(backendRoot, 'Dockerfile'),
  'utf8'
);
const dockerignore = fs.readFileSync(
  path.join(backendRoot, '.dockerignore'),
  'utf8'
);
const serverSource = fs.readFileSync(
  path.join(backendRoot, 'src/server.js'),
  'utf8'
);

describe('production runtime policy', () => {
  test('uses the supported Node 22 Alpine runtime', () => {
    expect(dockerfile).toMatch(/^FROM node:22-alpine/m);
  });

  test('installs deterministic production dependencies', () => {
    expect(dockerfile).toContain('RUN npm ci --omit=dev');
    expect(dockerfile).not.toContain('npm install');
  });

  test('runs the application as the non-root node user', () => {
    expect(dockerfile).toMatch(/^USER node$/m);
  });

  test('sets production NODE_ENV', () => {
    expect(dockerfile).toMatch(/^ENV NODE_ENV=production$/m);
  });

  test('uses the runtime PORT for container health checks', () => {
    expect(dockerfile).toContain('process.env.PORT||4000');
    expect(dockerfile).toContain("path:'/health'");
    expect(dockerfile).not.toContain('localhost:3000/health');
  });

  test('server uses the Render-compatible PORT contract', () => {
    expect(serverSource).toContain(
      "const PORT = process.env.PORT || 4000;"
    );
  });

  test('graceful shutdown closes the HTTP server', () => {
    expect(serverSource).toContain('server = app.listen(');
    expect(serverSource).toContain('server.close(');
    expect(serverSource).toContain(
      "process.on('SIGTERM', shutdown)"
    );
    expect(serverSource).toContain(
      "process.on('SIGINT', shutdown)"
    );
  });

  test('docker context excludes sensitive and unnecessary files', () => {
    expect(dockerignore).toMatch(/^node_modules$/m);
    expect(dockerignore).toMatch(/^\.env$/m);
    expect(dockerignore).toMatch(/^\.env\.\*$/m);
    expect(dockerignore).toMatch(/^src\/tests$/m);
  });
});
