import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API, withCredentials: true });

export const ADMIN_TOKEN_KEY = "mbi_admin_token";
export const ADMIN_USER_KEY = "mbi_admin_user";

export const getAdminUser = () => {
  try { return JSON.parse(localStorage.getItem(ADMIN_USER_KEY) || "null"); }
  catch { return null; }
};
// Token disimpan di httpOnly cookie oleh backend (aman dari XSS). Di localStorage
// hanya info user non-sensitif (nama/role) untuk gating tampilan.
export const setAdminSession = (user) => {
  localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(user));
};
export const clearAdminSession = () => {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(ADMIN_USER_KEY);
};

export const adminApi = axios.create({ baseURL: API, withCredentials: true });

export const LOGOS = {
  kbi: "https://customer-assets-lxgj4vgw.emergentagent.net/job_qris-payment-7/artifacts/xgt43uvr_image.png",
  mbi: "https://customer-assets-lxgj4vgw.emergentagent.net/job_qris-payment-7/artifacts/rvkwvhfz_image.png",
  qris: "https://customer-assets-lxgj4vgw.emergentagent.net/job_qris-payment-7/artifacts/q6kwbelz_image.png",
};

export const rupiah = (n) =>
  "Rp " + (n || 0).toLocaleString("id-ID");

export const CONTACT = {
  label: "Sekretariat MBI Kepri",
  phone: "0882-7123-1796",
  waLink: "https://wa.me/6288271231796",
};
