import { initLiquidGlass } from "./liquid-glass.js";

initLiquidGlass(document);

const setupMode = document.querySelector('meta[name="setup-mode"]')?.content === "true";
const adminPath = document.querySelector('meta[name="admin-path"]')?.content || "/studio-admin";

const titleEl = document.getElementById("auth-title");
const subEl = document.getElementById("auth-sub");
const confirmWrap = document.getElementById("confirm-wrap");
const confirmInput = document.getElementById("confirm-password");
const rememberWrap = document.getElementById("remember-wrap");
const submitBtn = document.getElementById("submit-btn");
const errorBox = document.getElementById("auth-error");
const form = document.getElementById("auth-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");

if (setupMode) {
  titleEl.textContent = "Configurar acesso administrador";
  subEl.textContent =
    "Primeiro acesso detectado. Crie sua senha forte (mínimo 10 caracteres). Após criada, esta tela de configuração é bloqueada permanentemente.";
  confirmWrap.style.display = "flex";
  confirmInput.required = true;
  rememberWrap.style.display = "none";
  submitBtn.textContent = "Criar conta administrativa";
  emailInput.value = "Pedrodanielbonfa@gmail.com";
  passwordInput.autocomplete = "new-password";
}

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.add("is-visible");
}

function clearError() {
  errorBox.textContent = "";
  errorBox.classList.remove("is-visible");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearError();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (setupMode) {
    if (password.length < 10) {
      showError("Use uma senha forte com pelo menos 10 caracteres.");
      return;
    }
    if (password !== confirmInput.value) {
      showError("As senhas não coincidem.");
      return;
    }
  }

  submitBtn.disabled = true;
  const originalLabel = submitBtn.textContent;
  submitBtn.textContent = "Verificando...";

  try {
    const endpoint = setupMode ? "/api/auth/setup" : "/api/auth/login";
    const body = setupMode
      ? { email, password }
      : { email, password, remember: document.getElementById("remember").checked };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showError(data.detail || "Não foi possível autenticar.");
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
      return;
    }

    window.location.replace(adminPath);
  } catch {
    showError("Erro de conexão com o servidor.");
    submitBtn.disabled = false;
    submitBtn.textContent = originalLabel;
  }
});
