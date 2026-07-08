// ============================================================
// test-01-auth.js — Stress del flujo de autenticación runner
// Prueba: request OTP -> verify OTP si aplica
// ============================================================

import http from "k6/http";
import { sleep, group, check } from "k6";

const BASE_URL =
  "https://dashboard-git-cursor-runner-admin-5e8011-cris-projects-d29e2137.vercel.app";

const VERCEL_BYPASS_TOKEN = "RLVmxMuqlBXDmm7Kh1vqhYAiBrDga3Kb";

function withBypass(path) {
  const separator = path.includes("?") ? "&" : "?";
  return `${BASE_URL}${path}${separator}x-vercel-set-bypass-cookie=true&x-vercel-protection-bypass=${VERCEL_BYPASS_TOKEN}`;
}

const THRESHOLDS = {
  http_req_failed: ["rate<0.05"],
  http_req_duration: ["p(95)<2000"],
};

export const options = {
  thresholds: THRESHOLDS,

  scenarios: {
    carga_suave: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 10 },
        { duration: "1m", target: 10 },
        { duration: "30s", target: 0 },
      ],
    },

    pico_alto: {
      executor: "ramping-vus",
      startVUs: 0,
      startTime: "2m30s",
      stages: [
        { duration: "20s", target: 200 },
        { duration: "40s", target: 200 },
        { duration: "20s", target: 0 },
      ],
      tags: { scenario: "pico_alto" },
    },

    stress_maximo: {
      executor: "ramping-vus",
      startVUs: 0,
      startTime: "5m",
      stages: [
        { duration: "1m", target: 500 },
        { duration: "2m", target: 500 },
        { duration: "30s", target: 0 },
      ],
      tags: { scenario: "stress_maximo" },
    },
  },
};

const TEST_PHONES = Array.from({ length: 500 }, (_, i) =>
  `+56977${String(i).padStart(6, "0")}`
);

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function checkStatusIn(res, name, statuses) {
  return check(res, {
    [`${name} status esperado`]: (r) => statuses.includes(r.status),
    [`${name} no es Vercel auth`]: (r) =>
      !String(r.body || "").includes("Authentication Required"),
  });
}

export default function () {
  const telefono = randomItem(TEST_PHONES);

  group("1. Solicitar OTP", () => {
    const res = http.post(
      withBypass("/api/auth/request-otp"),
      JSON.stringify({ telefono }),
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    checkStatusIn(res, "request-otp", [200, 403, 404]);

    if (res.status === 200) {
      sleep(randomInt(1, 3));

      group("2. Verificar OTP QA", () => {
        const verifyRes = http.post(
          withBypass("/api/auth/verify-otp"),
          JSON.stringify({
            telefono,
            codigo: "123456",
          }),
          {
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        checkStatusIn(verifyRes, "verify-otp", [200, 401, 403]);
      });
    }
  });

  sleep(randomInt(1, 2));
}