import http from "k6/http";
import { sleep } from "k6";

export const options = {
  stages: [
    { duration: "1m", target: 20 },
    { duration: "3m", target: 50 },
    { duration: "1m", target: 0 },
  ],
};

export default function () {
  const sku = String(100001 + Math.floor(Math.random() * 500));
  const phone = `56988${String(Math.floor(Math.random() * 1000000)).padStart(6, "0")}`;

  http.post(
    "https://n8n.aintegration.cl/webhook/qa-whatsapp-webhook",
    JSON.stringify({
      phone,
      message: sku,
      instance: "chatbot_aintegration_qa"
    }),
    {
      headers: {
        "Content-Type": "application/json"
      }
    }
  );

  sleep(1);
}