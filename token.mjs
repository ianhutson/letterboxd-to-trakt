import fetch from "node-fetch";
import dotenv from "dotenv";
import fs from "fs";
dotenv.config();

const traktClientId = process.env.TRAKTCLIENTID;
const traktClientSecret = process.env.TRAKTCLIENTSECRET;
const traktAuthorizationCode = process.env.TRAKTAUTHORIZATIONCODE;
let newAccessToken;
let newRefreshToken;

async function updateVariableGroupVariable(variableName, variableValue) {
  const organization = "yanhutson";
  const project = "letterdboxd-to-trakt";
  const variableGroupId = "1";
  const personalAccessToken = process.env.AZUREACCESSTOKEN;
  const url = `https://dev.azure.com/${organization}/${project}/_apis/distributedtask/variablegroups/${variableGroupId}?api-version=6.0-preview.2`;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Basic ${Buffer.from(`:${personalAccessToken}`).toString(
      "base64"
    )}`,
  };
  const response = await fetch(url, { method: "GET", headers });
  const textResponse = await response.text();
  
  try {
    const responseData = JSON.parse(textResponse);
    responseData.variables[variableName].value = variableValue;
  
    await fetch(url, {
      method: "PUT",
      headers,
      body: JSON.stringify(responseData),
    });
  } catch (error) {
    console.error("Error parsing Azure API response as JSON:", error);
  }
  if (fs.existsSync(".env")) {
    const envConfig = dotenv.parse(fs.readFileSync(".env"));
    if (envConfig.hasOwnProperty(variableName)) {
      envConfig[variableName] = variableValue;
      const updatedEnvFileContent = Object.entries(envConfig)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n");
      fs.writeFileSync(".env", updatedEnvFileContent);
    }
    console.log(`New ${variableName}: ${variableValue}`);
  }
}

async function getAccessToken() {
  const traktApiUrl = "https://api.trakt.tv/oauth/token";
  
  try {
    const response = await fetch(traktApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code: traktAuthorizationCode,
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
    return newAccessToken;
  } catch (error) {
    console.error("Error fetching access token:", error);
  }
}

getAccessToken();
