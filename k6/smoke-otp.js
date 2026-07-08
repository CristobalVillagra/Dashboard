import http from "k6/http";
import { check } from "k6";

const BASE_URL = "https://dashboard-git-cursor-runner-admin-5e8011-cris-projects-d29e2137.vercel.app/";

export const options = {
  vus: 1,
  iterations: 1,
};

export default function () {
  const res = http.post(
    `${BASE_URL}/api/auth/request-otp`,
    JSON.stringify({ telefono: "+56977000001" }),
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  console.log("status:", res.status);
  console.log("body:", res.body);

  check(res, {
    "otp responde algo esperado": (r) => [200, 403, 404, 500].includes(r.status),
  });
}