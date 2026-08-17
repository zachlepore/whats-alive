const enterButton = document.querySelector("#enter-button");
const landing = document.querySelector("#landing");
const statusMessage = document.querySelector("#status");
const observationView = document.querySelector("#observation");

const searchRadiusKm = 10;
const resultCount = 20;

enterButton.addEventListener("click", findNearbyWildlife);

function findNearbyWildlife() {
  if (!navigator.geolocation) {
    showError("Location services aren’t supported by this browser.");
    return;
  }

  enterButton.disabled = true;
  enterButton.textContent = "LOCATING…";
  statusMessage.textContent = "Your browser may ask for location permission.";

  navigator.geolocation.getCurrentPosition(loadObservations, handleLocationError, {
    enableHighAccuracy: false,
    timeout: 10000,
    maximumAge: 300000,
  });
}

async function loadObservations(position) {
  const { latitude, longitude } = position.coords;
  const parameters = new URLSearchParams({
    lat: latitude,
    lng: longitude,
    radius: searchRadiusKm,
    photos: "true",
    per_page: resultCount,
    order_by: "observed_on",
    order: "desc",
  });

  statusMessage.textContent = "Looking for nearby life…";

  try {
    const response = await fetch(`https://api.inaturalist.org/v1/observations?${parameters}`);

    if (!response.ok) {
      throw new Error(`iNaturalist returned ${response.status}`);
    }

    const data = await response.json();
    const observations = data.results.filter(hasUsablePhotoAndLocation);

    if (observations.length === 0) {
      showError("No recent observations with photos were found within 10 km. Try again somewhere else.");
      return;
    }

    const selected = observations[Math.floor(Math.random() * observations.length)];
    displayObservation(selected, latitude, longitude);
  } catch (error) {
    console.error(error);
    showError("We couldn’t reach iNaturalist right now. Check your connection and try again.");
  }
}

function hasUsablePhotoAndLocation(observation) {
  return observation.photos?.[0]?.url && observation.geojson?.coordinates?.length === 2;
}

function displayObservation(observation, userLatitude, userLongitude) {
  const taxon = observation.taxon;
  const commonName = taxon?.preferred_common_name || taxon?.name || "Unknown species";
  const scientificName = taxon?.name || "Scientific name unavailable";
  const [observationLongitude, observationLatitude] = observation.geojson.coordinates;
  const distance = distanceInKm(
    userLatitude,
    userLongitude,
    observationLatitude,
    observationLongitude,
  );
  const photoUrl = observation.photos[0].url.replace("square", "large");

  const image = document.querySelector("#observation-image");
  image.src = photoUrl;
  image.alt = `A nearby observation of ${commonName}`;
  document.querySelector("#common-name").textContent = commonName;
  document.querySelector("#scientific-name").textContent = scientificName;
  document.querySelector("#observation-date").textContent = formatDate(observation.observed_on);
  document.querySelector("#observation-distance").textContent = `About ${formatDistance(distance)} away`;

  const link = document.querySelector("#observation-link");
  link.href = observation.uri || `https://www.inaturalist.org/observations/${observation.id}`;

  landing.hidden = true;
  observationView.hidden = false;
}

function distanceInKm(lat1, lon1, lat2, lon2) {
  const earthRadiusKm = 6371;
  const toRadians = (degrees) => degrees * (Math.PI / 180);
  const latDifference = toRadians(lat2 - lat1);
  const lonDifference = toRadians(lon2 - lon1);
  const a =
    Math.sin(latDifference / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(lonDifference / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDate(date) {
  if (!date) return "Date unavailable";

  const parsedDate = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) return date;

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(parsedDate);
}

function formatDistance(distance) {
  return distance < 1 ? `${Math.max(0.1, distance).toFixed(1)} km` : `${distance.toFixed(1)} km`;
}

function handleLocationError(error) {
  const messages = {
    1: "Location access was denied. Allow location access in your browser and try again.",
    2: "Your location could not be determined. Check your device settings and try again.",
    3: "Finding your location took too long. Please try again.",
  };

  showError(messages[error.code] || "Something went wrong while finding your location.");
}

function showError(message) {
  statusMessage.textContent = message;
  enterButton.disabled = false;
  enterButton.textContent = "TRY AGAIN";
}
