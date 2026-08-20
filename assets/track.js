/* Stack Compass Guides — measurement layer.
 *
 * Answers one question: which channel sent a visitor, to which page, and which
 * CTA did they use to reach which offer.
 *
 * Two independent records are produced, so losing one does not blind us:
 *   1. PartnerStack Sub IDs on the outbound link  (survives without analytics)
 *   2. An analytics event on click                (survives without a conversion)
 *
 * Sub ID format is the documented PartnerStack one: ?sid1=..&sid2=..&sid3=..
 * https://support.partnerstack.com/hc/en-us/articles/360044949774
 *   sid1 = channel   sid2 = cta position   sid3 = page slug
 *
 * No cookies, no third-party bundle, no build step.
 */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ *
   * OWNER CONFIG — paste the Umami website ID here, then redeploy.
   * Free account: https://cloud.umami.is  (Hobby plan, cookieless, 100k events/mo)
   * Leave the placeholder untouched and the site simply runs without analytics.
   * ------------------------------------------------------------------ */
  var UMAMI_WEBSITE_ID = "05d6abd7-50b2-4464-9ba1-2c5fa5ee2ac6";
  var UMAMI_SRC = "https://cloud.umami.is/script.js";

  var STORE_KEY = "scg.channel";
  var VALID = /^[a-z0-9-]{1,64}$/;

  var REFERRERS = [
    [/(^|\.)google\./, "organic-search"],
    [/(^|\.)bing\.com$/, "organic-search"],
    [/(^|\.)duckduckgo\.com$/, "organic-search"],
    [/(^|\.)ecosia\.org$/, "organic-search"],
    [/(^|\.)search\.brave\.com$/, "organic-search"],
    [/(^|\.)yahoo\./, "organic-search"],
    [/(^|\.)x\.com$/, "x"],
    [/(^|\.)twitter\.com$/, "x"],
    [/(^|\.)t\.co$/, "x"],
    [/(^|\.)reddit\.com$/, "reddit"],
    [/(^|\.)redd\.it$/, "reddit"],
    [/(^|\.)youtube\.com$/, "youtube"],
    [/(^|\.)youtu\.be$/, "youtube"],
    [/(^|\.)tiktok\.com$/, "tiktok"],
    [/(^|\.)pinterest\./, "pinterest"],
    [/(^|\.)pin\.it$/, "pinterest"],
    [/(^|\.)quora\.com$/, "quora"],
    [/(^|\.)news\.ycombinator\.com$/, "hn"],
    [/(^|\.)indiehackers\.com$/, "indiehackers"],
    [/(^|\.)linkedin\.com$/, "linkedin"],
    [/(^|\.)lnkd\.in$/, "linkedin"],
    [/(^|\.)facebook\.com$/, "facebook"],
    [/(^|\.)substack\.com$/, "substack"]
  ];

  function param(name) {
    try {
      var v = new URLSearchParams(window.location.search).get(name);
      return v && VALID.test(v.toLowerCase()) ? v.toLowerCase() : null;
    } catch (e) {
      return null;
    }
  }

  function fromReferrer() {
    var ref = document.referrer;
    if (!ref) return null;
    var host;
    try {
      host = new URL(ref).hostname.toLowerCase();
    } catch (e) {
      return null;
    }
    if (host === window.location.hostname) return null;
    for (var i = 0; i < REFERRERS.length; i++) {
      if (REFERRERS[i][0].test(host)) return REFERRERS[i][1];
    }
    return "referral";
  }

  /* First touch wins for the session: an X visitor who then finds us again via
   * Google mid-session is still an X visitor for attribution purposes. */
  function channel() {
    var explicit = param("src") || param("utm_source");
    var stored = null;
    try {
      stored = window.sessionStorage.getItem(STORE_KEY);
    } catch (e) {
      /* private mode */
    }
    var value = explicit || stored || fromReferrer() || "direct";
    if (!VALID.test(value)) value = "other";
    if (!stored || explicit) {
      try {
        window.sessionStorage.setItem(STORE_KEY, value);
      } catch (e) {
        /* ignore */
      }
    }
    return value;
  }

  function pageSlug() {
    var declared = document.documentElement.getAttribute("data-page");
    if (declared && VALID.test(declared)) return declared;
    var parts = window.location.pathname.split("/").filter(Boolean);
    var last = parts[parts.length - 1] || "home";
    return VALID.test(last) ? last : "other";
  }

  var CHANNEL = channel();
  var PAGE = pageSlug();

  /* ---------------- Analytics (optional, cookieless) ---------------- */

  function loadAnalytics() {
    if (!UMAMI_WEBSITE_ID || UMAMI_WEBSITE_ID.indexOf("PASTE_") === 0) return;
    var s = document.createElement("script");
    s.async = true;
    s.defer = true;
    s.src = UMAMI_SRC;
    s.setAttribute("data-website-id", UMAMI_WEBSITE_ID);
    document.head.appendChild(s);
  }

  function event(name, data) {
    try {
      if (window.umami && typeof window.umami.track === "function") {
        window.umami.track(name, data);
      }
    } catch (e) {
      /* analytics must never break the page */
    }
  }

  /* ---------------- Affiliate link decoration ---------------- */

  function decorate(link) {
    var cta = link.getAttribute("data-cta") || "inline";
    var base = link.getAttribute("data-href") || link.href;
    var url;
    try {
      url = new URL(base);
    } catch (e) {
      return;
    }
    if (!link.getAttribute("data-href")) link.setAttribute("data-href", base);
    url.searchParams.set("sid1", CHANNEL);
    url.searchParams.set("sid2", cta);
    url.searchParams.set("sid3", PAGE);
    link.href = url.toString();
  }

  function wire() {
    var links = document.querySelectorAll("a[data-affiliate]:not([data-scg-wired])");
    for (var i = 0; i < links.length; i++) {
      links[i].setAttribute("data-scg-wired", "1");
      decorate(links[i]);
      links[i].addEventListener("click", function () {
        event("affiliate-click", {
          offer: this.getAttribute("data-affiliate"),
          cta: this.getAttribute("data-cta") || "inline",
          channel: CHANNEL,
          page: PAGE
        });
      });
    }

    /* Vendors we do not (yet) have a program with. Recording these is how we
     * learn which programs are worth applying for: demand first, then apply. */
    var outbound = document.querySelectorAll("a[data-outbound]:not([data-scg-wired])");
    for (var j = 0; j < outbound.length; j++) {
      outbound[j].setAttribute("data-scg-wired", "1");
      outbound[j].addEventListener("click", function () {
        event("outbound-click", {
          vendor: this.getAttribute("data-outbound"),
          cta: this.getAttribute("data-cta") || "inline",
          channel: CHANNEL,
          page: PAGE
        });
      });
    }
  }

  /* Exposed so page-level scripts (the selector) can report their own events. */
  window.scg = {
    channel: CHANNEL,
    page: PAGE,
    event: event,
    /* Page-level scripts that inject links (the selector) call this to have them
     * decorated and instrumented like any link that was in the HTML. */
    wire: function () {
      wire();
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wire);
  } else {
    wire();
  }
  loadAnalytics();
})();
