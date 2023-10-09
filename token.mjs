import fetch from "node-fetch";
import dotenv from "dotenv";
import { updateVariableGroupVariable } from "./run.mjs";
dotenv.config();

const traktClientId = process.env.TRAKTCLIENTID;
const traktClientSecret = process.env.TRAKTCLIENTSECRET;
let newAccessToken;
let newRefreshToken;

async function getAccessToken() {
  const traktApiUrl = "https://api.trakt.tv/oauth/token";
  try {
    const response = await fetch(traktApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code: "",
        client_id: traktClientId,
        client_secret: traktClientSecret,
        redirect_uri: "https://google.com",
        grant_type: "authorization_code",
      }),
    });
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    const responseData = await response.json();
    newAccessToken = responseData.access_token;
    newRefreshToken = responseData.refresh_token;
    await updateVariableGroupVariable("TRAKTACCESSTOKEN", newAccessToken);
    await updateVariableGroupVariable("TRAKTREFRESHTOKEN", newRefreshToken);
    console.log("New Access Token:", newAccessToken);
    console.log("New Refresh Token:", newRefreshToken);
    return newAccessToken;
  } catch (error) {
    console.error("Error getting access token:", error.message);
    throw error;
  }
}

getAccessToken();
