const express = require("express");
const axios = require("axios");


class TimeSeriesCache {//Class to handle caching for time-series data
  constructor(expirationDuration = 600000, refreshInterval = 60000) {
    this.cache = new Map();//Create a cache for key-value storage using map
    this.expirationDuration = expirationDuration;//Set default expiration time for cache entries i.e. 10 mins
    this.refreshInterval = refreshInterval; //Set interval for refreshing cache 1 min
    this.startAutoRefresh();//Automatically start refreshing cache at intervals
  }

  isExpired(entry) { //Check if a cache entry has expired based on its timestamp
    return Date.now() - entry.timestamp > this.expirationDuration;
  }

  set(key, data) { //Add or update data in the cache with a timestamp
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  get(key) {// Get data from the cache if it is still valid
    const entry = this.cache.get(key);
    if (entry && !this.isExpired(entry)) {
      return entry.data; 
    }
    this.cache.delete(key); // Removing expired data from the cache
    return null; // returning if no valid data is available
  }

  async fetchData(key, fetchFunction) {//Handle fetching data with caching logic
    const cachedData = this.get(key);

    if (cachedData) {
      console.log("Cache hit for", key); //If Cache contains valid data
      return cachedData;
    }

    console.log("Cache miss for", key); // Data not in cache or expired
    const newData = await fetchFunction(); // Fetch new data
    this.set(key, newData); // Store new data in the cache
    return newData;
  }

  startAutoRefresh() {// Automatically refresh the cache for entries that haven't expired
    setInterval(async () => {
      for (const [key, entry] of this.cache.entries()) {
        if (!this.isExpired(entry)) {
          console.log("Refreshing cache for", key); // Refresh data
          const refreshedData = await this.fetchFunction(key); // Fetch updated data
          this.set(key, refreshedData); // Update cache with refreshed data
        }
      }
    }, this.refreshInterval);
  }
}

function calculateTimeDifference(start, end) {// Utility function to calculate the difference between two times in minutes
  const startTime = new Date(start);
  const endTime = new Date(end);
  const differenceInMs = endTime - startTime; // Difference in milliseconds
  const differenceInMinutes = Math.floor(differenceInMs / (1000 * 60)); // Convert to minutes
  return `${differenceInMinutes}min`; // Return as string
}

const fetchDataFromAPI = async (symbol, period, startTime, endTime) => {// Function to fetch time-series data from an external API
  const apiKey = "3KGZSQDF3FNO45FI"; // API key for the Alpha Vantage API (I am using Time series for Intraday)

  // Interval is directly mapped to the API requirements (mocked here)
  const interval = period;
  const response = await axios.get(`https://www.alphavantage.co/query`, {
    params: {
      function: "TIME_SERIES_INTRADAY",
      symbol,
      interval,
      apikey: apiKey,
    },
  });

  //Process the API response to extract time-series data
  if (response.data["Time Series (1min)"]) {
    const data = Object.entries(response.data["Time Series (1min)"]).map(([time, values]) => ({
      time,
      open: parseFloat(values["1. open"]),
      high: parseFloat(values["2. high"]),
      low: parseFloat(values["3. low"]),
      close: parseFloat(values["4. close"]),
    }));
    return data;
  }

  throw new Error("Unexpected API response"); // Error if response is invalid
};

//Setting up the Express server
const app = express(); 
const cache = new TimeSeriesCache();//Creating a cache instance

app.get("/timeseries", async (req, res) => { //Endpoint to fetch time-series data
  const { symbol, period, start, end } = req.query;
  if (!symbol || !period || !start || !end) {
    return res.status(400).json({ error: "Missing required query parameters" });
  }

  const cacheKey = `${symbol}-${period}-${start}-${end}`; // Unique key for caching

  try {
    const cachedData = cache.get(cacheKey); // Check cache for data

    if (cachedData) {
      console.log("Cache hit");
      return res.json({ symbol, period, data: cachedData }); // Return cached data
    }

    console.log("Cache miss");
    const fetchedData = await fetchDataFromAPI(symbol, period, start, end); // Fetch new data
    cache.set(cacheKey, fetchedData); // Store new data in cache

    res.json({ symbol, period, data: fetchedData }); // Send response with new data
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch timeseries data" });
  }
});

const PORT = 3000; //Starting the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
