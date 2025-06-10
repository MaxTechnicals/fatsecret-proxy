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
  if (cachedToken && now < tokenExpiresAt) return cachedToken;

  const response = await axios.post("https://oauth.fatsecret.com/connect/token",
    new URLSearchParams({
      grant_type: "client_credentials",
      scope: "basic",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    }).toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  cachedToken = response.data.access_token;
  tokenExpiresAt = now + response.data.expires_in * 1000;
  return cachedToken;
}

app.get("/search", async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: "Missing query" });

  try {
    const token = await getAccessToken();

    const response = await axios.get("https://platform.fatsecret.com/rest/server.api", {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        method: "foods.search",
        format: "json",
        search_expression: query
      }
    });

    const foods = response.data.foods?.food || [];

    const results = foods.slice(0, 15).map(f => ({
      id: f.food_id,
      name: f.food_name
    }));

    res.json({ matches: results });
  } catch (err) {
    console.error("Search failed:", err.message);
    res.status(500).json({ error: "Failed to search foods" });
  }
});

app.get("/macros", async (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: "Missing food_id" });

  try {
    const token = await getAccessToken();

    const response = await axios.get("https://platform.fatsecret.com/rest/server.api", {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        method: "food.get.v2",
        format: "json",
        food_id: id
      }
    });

    const servings = response.data.food.servings?.serving;
    const nutrients = Array.isArray(servings) ? servings[0] : servings;

    if (!nutrients || !nutrients.calories) {
      return res.status(404).json({ error: "No valid nutrition data" });
    }

    res.json({
      calories: parseFloat(nutrients.calories),
      protein: parseFloat(nutrients.protein),
      fat: parseFloat(nutrients.fat),
      carbs: parseFloat(nutrients.carbohydrate)
    });
  } catch (err) {
    console.error("Macro fetch failed:", err.message);
    res.status(500).json({ error: "Failed to fetch macro data" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`FatSecret proxy running on port ${PORT}`);
});
