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
  const response = await fetch(traktApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // go to trakt website, authorize with oauth, copy code from url
      code: "f681177cc71fc1d1f51de6899937fa06c3b20eed2f2979e17182945adfee4835",
      client_id: traktClientId,
      client_secret: traktClientSecret,
      redirect_uri: "https://google.com",
      grant_type: "authorization_code",
    }),
  });
  const responseData = await response.json();
  newAccessToken = responseData.access_token;
  newRefreshToken = responseData.refresh_token;
  console.log(newRefreshToken)
  await updateVariableGroupVariable("TRAKTACCESSTOKEN", newAccessToken);
  await updateVariableGroupVariable("TRAKTREFRESHTOKEN", newRefreshToken);
  console.log("New Access Token:", newAccessToken);
  console.log("New Refresh Token:", newRefreshToken);
  return newAccessToken;
}

getAccessToken();
