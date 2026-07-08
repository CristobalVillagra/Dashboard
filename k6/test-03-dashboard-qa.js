// ============================================================
// test-03-dashboard.js — Stress del dashboard Next.js
// Prueba: runners leyendo mensajes, admin gestionando permisos,
//         Supabase realtime y queries pesadas simultáneas
//
// Cómo correr:
//   k6 run tests/test-03-dashboard.js
// ============================================================
import http from 'k6/http';
import { sleep, group, check } from 'k6';
import { Counter, Rate } from 'k6/metrics';
import { CONFIG, THRESHOLDS } from '../utils/config.js';
import { checkResponse, randomItem, randomInt, authHeaders, supabaseHeaders } from '../utils/helpers.js';

const errorRate = new Rate('errores_dashboard');
const querysPesadas = new Counter('queries_pesadas_ejecutadas');

export const options = {
  thresholds: {
    ...THRESHOLDS,
    errores_dashboard: ['rate<0.02'],  // menos de 2% de errores en dashboard
  },

  scenarios: {
    // Runners navegando el dashboard (mayoría de usuarios)
    runners_activos: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m',  target: 100 },
        { duration: '3m',  target: 300 },
        { duration: '2m',  target: 500 },
        { duration: '1m',  target: 0 },
      ],
      tags: { escenario: 'runners_activos' },
    },

    // Admin ejecutando acciones mientras hay carga
    admin_gestionando: {
      executor: 'constant-vus',
      vus: 5,  // pocos admins pero con operaciones pesadas
      duration: '7m',
      tags: { escenario: 'admin_gestionando' },
    },
  },
};

// ===========================================================
// Flujo de un RUNNER en el dashboard
// ===========================================================
function flujoRunner(runner) {
  group('Runner: ver mis mensajes pendientes', () => {
    const res = http.get(
      `${CONFIG.BASE_URL}/api/runner/messages?status=pending`,
      { headers: authHeaders(runner.token) }
    );
    checkResponse(res, 'runner-mensajes-pendientes');
  });

  sleep(randomInt(1, 3));

  group('Runner: responder a un mensaje', () => {
    const res = http.post(
      `${CONFIG.BASE_URL}/api/runner/messages/respond`,
      JSON.stringify({
        messageId: `msg_test_${randomInt(1, 1000)}`,
        response: 'Confirmado, producto encontrado',
        sku: randomItem(CONFIG.TEST_SKUS),
      }),
      { headers: authHeaders(runner.token) }
    );
    checkResponse(res, 'runner-responder');
  });

  sleep(randomInt(1, 2));

  group('Runner: ver historial', () => {
    const res = http.get(
      `${CONFIG.BASE_URL}/api/runner/messages?status=completed&limit=50`,
      { headers: authHeaders(runner.token) }
    );
    checkResponse(res, 'runner-historial');
  });

  sleep(randomInt(2, 5));

  // Supabase directo (lectura de datos propios via RLS)
  group('Runner: consulta Supabase directa', () => {
    const res = http.get(
      `${CONFIG.SUPABASE_URL}/rest/v1/mensajes?select=*,productos(nombre,sku)&status=eq.pending&order=created_at.desc&limit=20`,
      { headers: supabaseHeaders(runner.token) }
    );
    checkResponse(res, 'runner-supabase-directa');
    querysPesadas.add(1);
  });
}

// ===========================================================
// Flujo de un ADMIN en el dashboard
// ===========================================================
function flujoAdmin() {
  group('Admin: ver todos los runners activos', () => {
    const res = http.get(
      `${CONFIG.BASE_URL}/api/admin/runners?status=active`,
      { headers: authHeaders(CONFIG.ADMIN_TOKEN) }
    );
    checkResponse(res, 'admin-runners-activos');
  });

  sleep(1);

  group('Admin: ver métricas generales', () => {
    const res = http.get(
      `${CONFIG.BASE_URL}/api/admin/metrics`,
      { headers: authHeaders(CONFIG.ADMIN_TOKEN) }
    );
    checkResponse(res, 'admin-metricas');
  });

  sleep(1);

  group('Admin: cambiar permiso de un runner', () => {
    const runner = randomItem(CONFIG.TEST_RUNNERS);
    const res = http.patch(
      `${CONFIG.BASE_URL}/api/admin/runners/permissions`,
      JSON.stringify({
        phone: runner.phone,
        permissions: { canRespond: true, canViewHistory: true },
      }),
      { headers: authHeaders(CONFIG.ADMIN_TOKEN) }
    );
    checkResponse(res, 'admin-cambiar-permiso');
  });

  sleep(2);

  group('Admin: consulta pesada — reporte de mensajes del día', () => {
    const hoy = new Date().toISOString().split('T')[0];
    const res = http.get(
      `${CONFIG.SUPABASE_URL}/rest/v1/mensajes?select=*,runners(nombre,phone),productos(sku,nombre)&created_at=gte.${hoy}T00:00:00&order=created_at.desc`,
      { headers: supabaseHeaders(CONFIG.ADMIN_TOKEN) }
    );
    checkResponse(res, 'admin-reporte-diario');
    querysPesadas.add(1);
  });

  sleep(randomInt(2, 4));

  group('Admin: ver log de actividad', () => {
    const res = http.get(
      `${CONFIG.BASE_URL}/api/admin/activity-log?limit=100`,
      { headers: authHeaders(CONFIG.ADMIN_TOKEN) }
    );
    checkResponse(res, 'admin-activity-log');
  });

  sleep(3);
}

export default function () {
  // Determinar si este VU es admin o runner basado en el escenario
  const escenario = __ENV.K6_SCENARIO_NAME || exec?.scenario?.name || 'runners_activos';

  if (escenario === 'admin_gestionando') {
    flujoAdmin();
  } else {
    const runner = randomItem(CONFIG.TEST_RUNNERS);
    flujoRunner(runner);
  }
}