const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const CLIENT_ID = process.env.FATSECRET_CLIENT_ID;
const CLIENT_SECRET = process.env.FATSECRET_CLIENT_SECRET;

let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  const now = Date.now();

  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  const response = await axios.post("https://oauth.fatsecret.com/connect/token", new URLSearchParams({
    grant_type: "client_credentials",
    scope: "basic",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET
  }).toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" }
  });

  cachedToken = response.data.access_token;
  tokenExpiresAt = now + response.data.expires_in * 1000;

  return cachedToken;
}

async function getSuggestions(token, query) {
  try {
    const res = await axios.get("https://platform.fatsecret.com/rest/server.api", {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        method: "foods.search",
        format: "json",
        search_expression: query
      }
    });

    const foods = res.data.foods?.food || [];
    return foods.map(f => f.food_name).slice(0, 5);
  } catch (err) {
    console.error("Suggestion fetch failed:", err.message);
    return [];
  }
}

app.get("/macros", async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: "Missing query" });

  try {
    const token = await getAccessToken();

    const searchRes = await axios.get("https://platform.fatsecret.com/rest/server.api", {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        method: "foods.search",
        format: "json",
        search_expression: query
      }
    });

    const foods = searchRes.data.foods?.food;
    if (!foods || foods.length === 0) {
      return res.status(404).json({ error: "No match found", suggestions: [] });
    }

    const foodId = foods[0].food_id;
    const suggestions = foods.map(f => f.food_name).slice(0, 5);

    const detailRes = await axios.get("https://platform.fatsecret.com/rest/server.api", {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        method: "food.get.v2",
        format: "json",
        food_id: foodId
      }
    });

    const servings = detailRes.data.food.servings?.serving;
    const nutrients = Array.isArray(servings) ? servings[0] : servings;

    if (!nutrients || !nutrients.calories) {
      return res.status(404).json({ error: "No valid nutrition data", suggestions });
    }

    return res.status(200).json({
      calories: parseFloat(nutrients.calories),
      protein: parseFloat(nutrients.protein),
      fat: parseFloat(nutrients.fat),
      carbs: parseFloat(nutrients.carbohydrate),
      suggestions
    });

  } catch (err) {
    console.error("Unexpected error:", err.message);
    return res.status(500).json({ error: "Failed to fetch food data" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`FatSecret proxy running on port ${PORT}`);
});
