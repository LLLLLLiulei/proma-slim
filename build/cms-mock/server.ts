const port = Number(process.env.PORT || '8890')
const basePath = normalizeBasePath(process.env.PAGE_BUILDER_BASE_PATH || '/pagebuilder')
const integrationSecret = process.env.PAGE_BUILDER_INTEGRATION_SECRET || 'cms-verify-secret'
const cmsCookie = process.env.CMS_VERIFY_COOKIE || 'CurrentSite=1; ZUSID=cms-verify'

const mockCatalog = {
  id: 101,
  parentID: 0,
  innerCode: '001001',
  status: '20',
  name: 'CMS Verify News',
  alias: 'cms_verify_news',
  contentType: 'Article',
  contentTypeName: '文章',
  info: 'CMS verify catalog',
  path: 'news/',
  link: 'http://nginx:8080/manager/news/',
  logoFile: 'assets/banner.txt',
  siteID: 1,
  hasChild: false,
  total: 1,
}

const mockContent = {
  id: 501,
  catalogID: 101,
  title: 'CMS Verify Content',
  summary: 'Content item for PageBuilder CMS verify mode',
  logoFile: 'assets/banner.txt',
  publishUrl: 'http://nginx:8080/manager/news/501.html',
  addTime: '2026-05-17 10:00:00',
}

function normalizeBasePath(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '/') return ''
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withLeadingSlash.replace(/\/+$/, '')
}

function json(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json; charset=utf-8')
  headers.set('cache-control', 'no-store')
  return new Response(JSON.stringify(body), { ...init, headers })
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function loginResponse(request: Request): Response {
  const cookie = request.headers.get('cookie') || ''
  const loggedIn = Boolean(cookie.trim()) && !cookie.includes('expired')
  return json({
    status: 1,
    data: loggedIn
      ? {
          logined: true,
          userName: 'cms-verify-user',
          realName: 'CMS Verify User',
          roleType: 'admin',
          isAdminUser: true,
        }
      : { logined: false },
  })
}

function mockHomeHtml(origin: string): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>CMS Verify Mock</title>
  <style>
    body { font-family: sans-serif; margin: 24px; color: #1f2937; }
    button { margin-right: 8px; padding: 8px 12px; }
    iframe { display: block; width: 100%; height: 520px; margin-top: 16px; border: 1px solid #cbd5e1; }
    pre { padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>CMS Verify Mock</h1>
  <p>This page exercises same-origin PageBuilder handoff URLs through ${basePath || '/'}.</p>
  <button id="builder-frame">Open builder in iframe</button>
  <button id="builder-window">Open builder in window</button>
  <button id="preview-frame">Open preview in iframe</button>
  <button id="preview-window">Open preview in window</button>
  <pre id="log">Ready at ${origin}</pre>
  <iframe id="frame" title="PageBuilder handoff target"></iframe>
  <script>
    const basePath = ${JSON.stringify(basePath)};
    const secret = ${JSON.stringify(integrationSecret)};
    const cmsCookie = ${JSON.stringify(cmsCookie)};
    const log = (message) => { document.getElementById('log').textContent = message; };
    async function createProject() {
      const response = await fetch(basePath + '/api/integrations/cms/projects', {
        method: 'POST',
        headers: {
          'authorization': 'Bearer ' + secret,
          'content-type': 'application/json',
          'x-cms-cookie': cmsCookie,
        },
        body: JSON.stringify({
          externalRecordId: 'cms-mock-' + Date.now(),
          projectName: 'CMS Mock Project',
          siteId: '1',
        }),
      });
      if (!response.ok) throw new Error('create project failed: ' + response.status + ' ' + await response.text());
      return await response.json();
    }
    async function createHandoff(target, openMode) {
      const project = await createProject();
      const response = await fetch(basePath + '/api/integrations/cms/projects/' + encodeURIComponent(project.projectId) + '/handoffs', {
        method: 'POST',
        headers: {
          'authorization': 'Bearer ' + secret,
          'content-type': 'application/json',
          'x-cms-cookie': cmsCookie,
        },
        body: JSON.stringify({ target, openMode }),
      });
      if (!response.ok) throw new Error('create handoff failed: ' + response.status + ' ' + await response.text());
      return await response.json();
    }
    async function openHandoff(target, openMode) {
      log('Creating ' + target + ' handoff for ' + openMode + '...');
      const handoff = await createHandoff(target, openMode);
      log(JSON.stringify(handoff, null, 2));
      if (openMode === 'iframe') {
        document.getElementById('frame').src = handoff.openUrl;
      } else {
        window.open(handoff.openUrl, '_blank', 'noopener,noreferrer');
      }
    }
    document.getElementById('builder-frame').onclick = () => openHandoff('builder', 'iframe').catch((error) => log(error.stack || String(error)));
    document.getElementById('builder-window').onclick = () => openHandoff('builder', 'window').catch((error) => log(error.stack || String(error)));
    document.getElementById('preview-frame').onclick = () => openHandoff('preview', 'iframe').catch((error) => log(error.stack || String(error)));
    document.getElementById('preview-window').onclick = () => openHandoff('preview', 'window').catch((error) => log(error.stack || String(error)));
  </script>
</body>
</html>`
}

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url)

  if (url.pathname === '/manager/ui/login') {
    return loginResponse(request)
  }

  if (url.pathname === '/manager/api/token' && request.method === 'POST') {
    const body = await readJson(request)
    if (!body.username || !body.password) {
      return json({ status: 0, message: 'missing credentials' }, { status: 401 })
    }
    return json({ status: 1, access_token: 'Bearer cms-verify-token', expires_in: 18000 })
  }

  if (url.pathname === '/manager/api/sites') {
    return json({ status: 1, data: [{ id: 1, name: 'CMS Verify Site', url: `${url.origin}/manager/` }] })
  }

  if (url.pathname === '/manager/api/catalogsTree') {
    return json({ status: 1, data: [mockCatalog] })
  }

  if (url.pathname === '/manager/api/catalogs') {
    if (url.searchParams.get('id') === '999') {
      return json({ status: 1, data: [] })
    }

    if (url.searchParams.has('id')) {
      return json({ status: 1, data: mockCatalog })
    }

    return json({ status: 1, data: [mockCatalog], total: 1 })
  }

  if (url.pathname === '/manager/api/catalogs/101/contents') {
    return json({
      status: 1,
      data: {
        pageIndex: Number(url.searchParams.get('pageIndex') || '0'),
        pageSize: Number(url.searchParams.get('pageSize') || '20'),
        total: 1,
        data: [mockContent],
      },
    })
  }

  if (url.pathname === '/manager/assets/banner.txt') {
    return new Response('cms-verify-asset', {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
      },
    })
  }

  if (url.pathname === '/cms-mock' || url.pathname === '/cms-mock/') {
    return new Response(mockHomeHtml(url.origin), {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }

  return new Response('Not Found', { status: 404 })
}

Bun.serve({
  port,
  fetch: handleRequest,
})

console.log(`[CMS Mock] listening on http://0.0.0.0:${port}`)
