(function () {
  function projectPoint(lat, lon, width, height) {
    return {
      x: ((lon + 180) / 360) * width,
      y: ((90 - lat) / 180) * height
    };
  }

  function uniqueLocations(locations) {
    return locations.filter((location) => typeof location.lat === "number" && typeof location.lon === "number");
  }

  function describeLocation(location) {
    const place = [location.label, location.city, location.country].filter(Boolean).join(", ");
    return location.period ? place + " (" + location.period + ")" : place;
  }

  function renderPins(shell, locations) {
    const pinLayer = shell.querySelector("[data-pin-layer]");
    const locationList = shell.querySelector("[data-location-list]");
    const width = 1000;
    const height = 500;

    pinLayer.innerHTML = "";
    locationList.innerHTML = "";

    uniqueLocations(locations).forEach((location) => {
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
      item.textContent = title;
      locationList.appendChild(item);
    });
  }

  function boot(shell) {
    const locations = JSON.parse(shell.dataset.locations || "[]");
    renderPins(shell, uniqueLocations(locations));
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-visitor-map]").forEach(boot);
  });
})();
