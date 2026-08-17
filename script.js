const enterButton = document.querySelector("#enter-button");
const landing = document.querySelector("#landing");
const statusMessage = document.querySelector("#status");
const ecosystem = document.querySelector("#ecosystem");
const organismsLayer = document.querySelector("#organisms");
const details = document.querySelector("#details");
const detailsClose = document.querySelector("#details-close");
const sceneDimmer = document.querySelector("#scene-dimmer");

const SEARCH_RADIUS_KM = 10;
const RESULT_POOL_SIZE = 50;
const DESKTOP_ORGANISM_COUNT = 9;
const MOBILE_ORGANISM_COUNT = 7;
let openBubble = null;

const sceneSlots = {
  sky: [
    { x: 18, y: 22 }, { x: 43, y: 30 }, { x: 69, y: 20 }, { x: 83, y: 38 },
  ],
  middle: [
    { x: 13, y: 49 }, { x: 37, y: 53 }, { x: 62, y: 48 }, { x: 86, y: 57 },
  ],
  ground: [
    { x: 10, y: 76 }, { x: 29, y: 81 }, { x: 50, y: 75 }, { x: 71, y: 82 }, { x: 90, y: 76 },
  ],
};

enterButton.addEventListener("click", findNearbyWildlife);
detailsClose.addEventListener("click", closeDetails);
sceneDimmer.addEventListener("click", closeDetails);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && openBubble) closeDetails();
});

function findNearbyWildlife() {
  if (!navigator.geolocation) {
    showError("This browser can’t find your location. It may be too ancient for the biosphere.");
    return;
  }

  enterButton.disabled = true;
  enterButton.textContent = "FINDING YOU…";
  statusMessage.textContent = "Your browser may ask for location permission.";
  navigator.geolocation.getCurrentPosition(loadObservations, handleLocationError, {
    enableHighAccuracy: false,
    timeout: 10000,
    maximumAge: 300000,
  });
}

async function loadObservations(position) {
  const { latitude, longitude } = position.coords;
  statusMessage.textContent = "Looking under rocks and behind bushes…";

  try {
    const observations = await fetchNearbyObservations(latitude, longitude);
    const targetCount = window.matchMedia("(max-width: 600px)").matches
      ? MOBILE_ORGANISM_COUNT
      : DESKTOP_ORGANISM_COUNT;
    const selected = selectDiverseOrganisms(observations, targetCount);

    if (selected.length === 0) {
      showError("We couldn’t find any photo observations within 10 km. Even the worms are hiding.");
      return;
    }

    spawnOrganismBubbles(selected, latitude, longitude);
    landing.hidden = true;
    ecosystem.hidden = false;
  } catch (error) {
    console.error(error);
    showError("iNaturalist isn’t answering right now. Check your connection and try again.");
  }
}

async function fetchNearbyObservations(latitude, longitude) {
  const parameters = new URLSearchParams({
    lat: latitude,
    lng: longitude,
    radius: SEARCH_RADIUS_KM,
    photos: "true",
    per_page: RESULT_POOL_SIZE,
    order_by: "observed_on",
    order: "desc",
  });
  const response = await fetch(`https://api.inaturalist.org/v1/observations?${parameters}`);
  if (!response.ok) throw new Error(`iNaturalist returned ${response.status}`);

  const data = await response.json();
  return data.results.filter(hasUsablePhotoAndLocation);
}

function hasUsablePhotoAndLocation(observation) {
  return Boolean(observation.photos?.[0]?.url && observation.geojson?.coordinates?.length === 2);
}

function selectDiverseOrganisms(observations, limit) {
  const shuffled = [...observations].sort(() => Math.random() - 0.5);
  const speciesSeen = new Set();
  const selected = [];

  for (const observation of shuffled) {
    const speciesKey = observation.taxon?.id || observation.species_guess?.toLowerCase();
    if (!speciesKey || speciesSeen.has(speciesKey)) continue;
    speciesSeen.add(speciesKey);
    selected.push(observation);
    if (selected.length === limit) break;
  }

  return selected;
}

function classifyTaxon(observation, index) {
  const group = observation.taxon?.iconic_taxon_name;
  if (group === "Plantae" || group === "Fungi") return "ground";
  if (group === "Aves") return "sky";
  if (group === "Insecta" || group === "Arachnida") return index % 2 === 0 ? "sky" : "middle";
  if (["Mammalia", "Reptilia", "Amphibia", "Mollusca"].includes(group)) return "middle";
  return "middle";
}

function spawnOrganismBubbles(observations, userLatitude, userLongitude) {
  organismsLayer.replaceChildren();
  const usedSlots = { sky: 0, middle: 0, ground: 0 };

  observations.forEach((observation, index) => {
    let region = classifyTaxon(observation, index);
    if (usedSlots[region] >= sceneSlots[region].length) {
      region = ["middle", "ground", "sky"].find((name) => usedSlots[name] < sceneSlots[name].length) || region;
    }
    const slot = sceneSlots[region][usedSlots[region] % sceneSlots[region].length];
    usedSlots[region] += 1;
    organismsLayer.append(createBubble(observation, userLatitude, userLongitude, region, slot, index));
  });

  document.querySelector("#scene-count").textContent = `${observations.length} neighbors showed up`;
}

function createBubble(observation, userLatitude, userLongitude, region, slot, index) {
  const commonName = observation.taxon?.preferred_common_name || observation.taxon?.name || "Mystery thing";
  const bubble = document.createElement("button");
  bubble.type = "button";
  bubble.className = `organism organism--${region}`;
  bubble.style.setProperty("--x", `${slot.x}%`);
  bubble.style.setProperty("--y", `${slot.y}%`);
  bubble.style.setProperty("--tilt", `${[-5, 3, -2, 6, -4][index % 5]}deg`);
  bubble.style.setProperty("--delay", `${-(index * 1.7)}s`);
  bubble.setAttribute("aria-label", `Open details for ${commonName}`);

  const image = document.createElement("img");
  image.src = observation.photos[0].url.replace("square", "medium");
  image.alt = commonName;
  bubble.append(image);
  bubble.addEventListener("click", () => openDetails(bubble, observation, userLatitude, userLongitude));
  return bubble;
}

function openDetails(bubble, observation, userLatitude, userLongitude) {
  if (openBubble && openBubble !== bubble) closeDetails(false);
  openBubble = bubble;
  bubble.classList.add("is-open");
  ecosystem.classList.add("has-open-details");

  const commonName = observation.taxon?.preferred_common_name || observation.taxon?.name || "Mystery thing";
  const scientificName = observation.taxon?.name || "Scientific name unknown";
  const [observationLongitude, observationLatitude] = observation.geojson.coordinates;
  const distance = distanceInKm(userLatitude, userLongitude, observationLatitude, observationLongitude);

  document.querySelector("#detail-common-name").textContent = commonName;
  document.querySelector("#detail-scientific-name").textContent = scientificName;
  document.querySelector("#detail-date").textContent = formatDate(observation.observed_on);
  document.querySelector("#detail-distance").textContent = formatDistance(distance);
  document.querySelector("#detail-link").href = observation.uri || `https://www.inaturalist.org/observations/${observation.id}`;
  details.hidden = false;
  detailsClose.focus();
}

function closeDetails(returnFocus = true) {
  if (!openBubble) return;
  const previousBubble = openBubble;
  previousBubble.classList.remove("is-open");
  ecosystem.classList.remove("has-open-details");
  details.hidden = true;
  openBubble = null;
  if (returnFocus) previousBubble.focus();
}

function distanceInKm(lat1, lon1, lat2, lon2) {
  const toRadians = (degrees) => degrees * (Math.PI / 180);
  const latDifference = toRadians(lat2 - lat1);
  const lonDifference = toRadians(lon2 - lon1);
  const a = Math.sin(latDifference / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(lonDifference / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDate(date) {
  if (!date) return "some mystery day";
  const parsedDate = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return date;
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(parsedDate);
}

function formatDistance(distance) {
  const rounded = distance < 1 ? Math.max(0.1, distance).toFixed(1) : distance.toFixed(1);
  return `${rounded} km away`;
}

function handleLocationError(error) {
  const messages = {
    1: "Location was denied. Let us peek at your location, then try again.",
    2: "We can’t figure out where you are. Check your device settings and try again.",
    3: "Finding you took too long. You are extremely well hidden. Try again?",
  };
  showError(messages[error.code] || "Something went wonky while finding your location.");
}

function showError(message) {
  statusMessage.textContent = message;
  enterButton.disabled = false;
  enterButton.textContent = "TRY AGAIN";
}
