import * as Home from "@/routes/home";
import * as Player from "@/routes/player";
import * as Recorder from "@/routes/recorder";
import * as Crop from "@/routes/crop";

const routes = [
  {
    path: "/",
    page: Home.Page,
    script: Home.Script,
  },
  {
    path: "/player",
    page: Player.Page,
    script: Player.Script,
  },
  {
    path: "/recorder",
    page: Recorder.Page,
    script: Recorder.Script,
  },
  {
    path: "/crop",
    page: Crop.Page,
    script: Crop.Script,
  },
];

function setRouteHtml() {
  const root: HTMLElement | null = document.getElementById("app");
  if (!root) return;

  const route = routes.find((route) => route.path == window.location.pathname);
  if (!route) return;

  const html = route.page;
  root.style.opacity = "0.0";

  setTimeout(() => {
    root.innerHTML = html;
    root.style.opacity = "1.0";
    route.script();
  }, 250);
}

function handleNavigate(mouseEvent: MouseEvent) {
  if (!mouseEvent) return;
  mouseEvent.preventDefault();

  const target = mouseEvent.target as HTMLAnchorElement;
  if (!target) return;

  history.pushState({}, "newUrl", target.href);
  setRouteHtml();
}

function handleActivateLink(link: HTMLAnchorElement) {
  link.addEventListener("click", handleNavigate);
}

function setupEventListeners() {
  window.addEventListener("popstate", setRouteHtml);
  window.addEventListener("DOMContentLoaded", setRouteHtml);
  document.querySelectorAll<HTMLAnchorElement>("a[data-link]").forEach(handleActivateLink);
}

setupEventListeners();
