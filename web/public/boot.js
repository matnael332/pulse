// Runs before the page paints: the saved or the browser's language sets <html lang dir>, so the
// page never flips after load. (The colour scheme is fixed: the site is dark only.)
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
})();
