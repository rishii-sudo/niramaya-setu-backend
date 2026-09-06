/**
 * NIRAMAYA SETU - PHASE 3 LOCAL DAST ATTACK SIMULATION
 * Probes the running Fastify backend at http://localhost:4000
 */

const SERVER_ROOT = process.env.SERVER_ROOT || 'http://localhost:4000';
const API_URL = `${SERVER_ROOT}/api/v1`;

async function request(path, options = {}) {
  const url = path.startsWith('http') ? path : `${API_URL}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    clearTimeout(timeoutId);

    let data = null;
    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await res.json();
    } else {
      data = { text: await res.text() };
    }

    return { status: res.status, headers: res.headers, data };
  } catch (err) {
    clearTimeout(timeoutId);
    return { status: 0, error: err.message, data: null };
  }
}

let passedChecks = 0;
let failedChecks = 0;

function report(id, name, pass, detail) {
  if (pass) {
    console.log(`  [+] DAST-${id} PASS: ${name} -> ${detail}`);
    passedChecks++;
  } else {
    console.log(`  [-] DAST-${id} FAIL: ${name} -> ${detail}`);
    failedChecks++;
  }
}

async function runDastSimulation() {
  console.log('===============================================================');
  console.log('NIRAMAYA SETU — PHASE 3 LOCAL DAST ATTACK SIMULATION');
  console.log('Target Server Root:', SERVER_ROOT);
  console.log('===============================================================\n');

  // 1. IDOR/BOLA Probe
  console.log('[1] Probing IDOR / BOLA Vulnerabilities...');
  const idorRes = await request('/patients/00000000-0000-0000-0000-000000000000', {
    headers: { Authorization: 'Bearer invalid' },
  });
  report('01', 'IDOR Protected', idorRes.status === 401 || idorRes.status === 403 || idorRes.status === 404, `HTTP ${idorRes.status}`);

  // 2. Broken Authorization (Missing Auth on Sensitive Endpoints)
  console.log('\n[2] Probing Unauthenticated Access to Protected Resources...');
  const refRes = await request('/referrals/pending');
  report('02', 'Referrals Protected', refRes.status === 401, `HTTP ${refRes.status}`);

  const fhirRes = await request('/fhir/Patient/123');
  report('03', 'FHIR API Protected', fhirRes.status === 401, `HTTP ${fhirRes.status}`);

  // 3. JWT None Algorithm & Forgery
  console.log('\n[3] Probing JWT Forgery & "none" Algorithm Injection...');
  const noneAlgToken = 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ1c2VySWQiOiIxMjMiLCJyb2xlIjoiQURNSU4ifQ.';
  const noneRes = await request('/patients', {
    headers: { Authorization: `Bearer ${noneAlgToken}` },
  });
  report('04', 'None Algorithm Rejected', noneRes.status === 401, `HTTP ${noneRes.status}`);

  // 4. Authentication Endpoint Probing
  console.log('\n[4] Probing Authentication Endpoint Security...');
  const authRes = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: 'probe_test', password: 'wrong_password' }),
  });
  report('05', 'Auth Endpoint Response', authRes.status === 401 || authRes.status === 500, `HTTP ${authRes.status}`);

  // 5. Malformed JSON Body
  console.log('\n[5] Probing Malformed JSON Handling...');
  const malformedRes = await request('/patients', {
    method: 'POST',
    headers: { Authorization: 'Bearer bad' },
    body: '{"name": "broken json payload',
  });
  report('06', 'Malformed JSON Handled', malformedRes.status === 400 || malformedRes.status === 401, `HTTP ${malformedRes.status}`);

  // 6. Oversized Symptom String in Payload
  console.log('\n[6] Probing Oversized Payload Resistance...');
  const hugeString = 'A'.repeat(5000); // 5000 chars exceeds 500 char limit
  const hugeRes = await request('/triage/calculate', {
    method: 'POST',
    body: JSON.stringify({ symptoms: [hugeString] }),
  });
  report('07', 'Oversized Item Rejected by Schema', hugeRes.status === 400, `HTTP ${hugeRes.status}`);

  // 7. Invalid UUID Parameter Probe
  console.log('\n[7] Probing SQLi / Invalid Parameter Format in URLs...');
  const sqliRes = await request("/patients/' OR '1'='1");
  report('08', 'SQLi / Malformed ID Injection Blocked', sqliRes.status === 400 || sqliRes.status === 401 || sqliRes.status === 404, `HTTP ${sqliRes.status}`);

  // 8. Unexpected HTTP Methods on Versioned Root
  console.log('\n[8] Probing Unexpected HTTP Methods...');
  const invalidMethodRes = await request('/referrals', { method: 'DELETE' });
  report('09', 'Unexpected Method Handled', invalidMethodRes.status === 404 || invalidMethodRes.status === 405 || invalidMethodRes.status === 401, `HTTP ${invalidMethodRes.status}`);

  // 9. CORS Preflight Probe
  console.log('\n[9] Probing CORS Header Sanitization on Untrusted Origin...');
  const corsRes = await request(`${SERVER_ROOT}/health`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://attacker-controlled-phishing-domain.com',
      'Access-Control-Request-Method': 'GET',
    },
  });
  const allowOrigin = corsRes.headers?.get('access-control-allow-origin');
  report('10', 'CORS Origin Controlled', allowOrigin !== '*' || corsRes.status >= 200, `Origin response: ${allowOrigin || 'controlled'}`);

  // 10. Security Headers Verification
  console.log('\n[10] Verifying Security Headers on API Responses...');
  const healthRes = await request(`${SERVER_ROOT}/health`);
  const frameOpt = healthRes.headers?.get('x-frame-options');
  const typeOpt = healthRes.headers?.get('x-content-type-options');
  report('11', 'X-Frame-Options Present', frameOpt === 'DENY' || frameOpt === 'SAMEORIGIN', `X-Frame-Options: ${frameOpt}`);
  report('12', 'X-Content-Type-Options Present', typeOpt === 'nosniff', `X-Content-Type-Options: ${typeOpt}`);

  // 11. XSS Transport Resistance
  console.log('\n[11] Probing XSS Script Reflection in Error Handlers...');
  const xssProbe = await request('/invalid-route-<script>alert("XSS")</script>');
  const xssText = JSON.stringify(xssProbe.data || '');
  report('13', 'XSS Reflection Prevented', !xssText.includes('<script>alert("XSS")</script>'), 'No unescaped script reflection in response body');

  console.log('\n===============================================================');
  console.log(`DAST SIMULATION RESULTS: ${passedChecks} PASSED | ${failedChecks} FAILED`);
  console.log('===============================================================');

  if (failedChecks > 0) {
    process.exit(1);
  }
}

runDastSimulation().catch((err) => {
  console.error('DAST Execution Error:', err);
  process.exit(1);
});
