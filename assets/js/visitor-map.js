(function () {
  function projectPoint(lat, lon, width, height) {
    return {
      x: ((lon + 180) / 360) * width,
      y: ((90 - lat) / 180) * height
    };
  }

  function uniqueLocations(locations) {
    const grouped = new Map();

    locations.forEach((location) => {
      const key = [
        location.city || "",
        location.region || "",
        location.country || "",
        location.lat,
        location.lon
      ].join("|");

      if (!grouped.has(key)) {
        grouped.set(key, {
          city: location.city || "",
          region: location.region || "",
          country: location.country || "",
          lat: location.lat,
          lon: location.lon,
          count: Number(location.count || location.visit_count || 1)
        });
        return;
      }

      const current = grouped.get(key);
      current.count += Number(location.count || location.visit_count || 1);
    });

    return Array.from(grouped.values());
  }

  function describeLocation(location) {
    return [location.city, location.region, location.country].filter(Boolean).join(", ");
  }

  async function loadLocations(shell) {
    const embedded = JSON.parse(shell.dataset.locations || "[]");
    const readUrl = shell.dataset.readUrl;

    if (!readUrl) return embedded;

    try {
      const response = await fetch(readUrl, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Failed to load remote visitor data");
      const remoteLocations = await response.json();
      return Array.isArray(remoteLocations) ? remoteLocations : embedded;
    } catch (error) {
      console.warn("Falling back to local visitor locations.", error);
      return embedded;
    }
  }

  async function submitVisitor(shell) {
    const submitUrl = shell.dataset.submitUrl;
    if (!submitUrl || sessionStorage.getItem("visitor-map-submitted")) return;

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const language = navigator.language;

    try {
      await fetch(submitUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timezone: timezone,
          language: language,
          visitedAt: new Date().toISOString()
        })
      });
      sessionStorage.setItem("visitor-map-submitted", "true");
    } catch (error) {
      console.warn("Visitor location submission skipped.", error);
    }
  }

  function renderPins(shell, locations) {
    const pinLayer = shell.querySelector("[data-pin-layer]");
    const locationList = shell.querySelector("[data-location-list]");
    const width = 1000;
    const height = 500;

    pinLayer.innerHTML = "";
    locationList.innerHTML = "";

    uniqueLocations(locations).forEach((location) => {
      if (typeof location.lat !== "number" || typeof location.lon !== "number") return;

      const point = projectPoint(location.lat, location.lon, width, height);
      const marker = document.createElementNS("http://www.w3.org/2000/svg", "g");
      const pulse = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");

      marker.setAttribute("class", "visitor-pin");
      pulse.setAttribute("cx", point.x);
      pulse.setAttribute("cy", point.y);
      pulse.setAttribute("r", "11");
      pulse.setAttribute("class", "visitor-pin-pulse");

      dot.setAttribute("cx", point.x);
      dot.setAttribute("cy", point.y);
      dot.setAttribute("r", "4.5");
      dot.setAttribute("class", "visitor-pin-dot");
      dot.setAttribute("filter", "url(#glow)");

      label.setAttribute("x", point.x + 10);
      label.setAttribute("y", point.y - 10);
      label.setAttribute("class", "visitor-pin-label");
      const title = describeLocation(location);
      label.textContent = title;

      marker.appendChild(pulse);
      marker.appendChild(dot);
      marker.appendChild(label);
      pinLayer.appendChild(marker);

      const item = document.createElement("li");
      item.textContent = location.count > 1 ? title + " (" + location.count + " visits)" : title;
      locationList.appendChild(item);
    });
  }

  async function boot(shell) {
    const locations = await loadLocations(shell);
    renderPins(shell, locations);
    submitVisitor(shell);
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-visitor-map]").forEach(boot);
  });
})();
