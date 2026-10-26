// Runs before the page paints: the saved or the browser's language sets <html lang dir>, and the
// saved colour scheme (or the system's) sets Mantine's attribute, so nothing flips after load.
(function () {
  var html = document.documentElement;
  var lang = null;
  try {
    lang = localStorage.getItem("pulse.lang");
  } catch (e) {}
  if (lang !== "he" && lang !== "en") {
    var first = (navigator.languages && navigator.languages[0]) || navigator.language || "";
    lang = first.toLowerCase().indexOf("en") === 0 ? "en" : "he";
  }
  html.lang = lang;
  html.dir = lang === "he" ? "rtl" : "ltr";
  var scheme = null;
  try {
    scheme = localStorage.getItem("mantine-color-scheme-value");
  } catch (e) {}
  if (scheme !== "light" && scheme !== "dark") {
    scheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  html.setAttribute("data-mantine-color-scheme", scheme);
})();
