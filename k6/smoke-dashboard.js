import http from "k6/http";
import { check } from "k6";

const BASE_URL = "https://dashboard-git-cursor-runner-admin-5e8011-cris-projects-d29e2137.vercel.app/";

export const options = {
  vus: 1,
  iterations: 1,
};

export default function () {
  const res = http.get(`${BASE_URL}/`);

  console.log("status:", res.status);
  console.log("url:", `${BASE_URL}/`);
  console.log("body length:", res.body ? res.body.length : 0);

  check(res, {
    "dashboard responde 200": (r) => r.status === 200,
  });
}