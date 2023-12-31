import fetch from "node-fetch";
import dotenv from "dotenv";
import fs from 'fs'
dotenv.config();

const traktClientId = process.env.TRAKTCLIENTID;
const traktClientSecret = process.env.TRAKTCLIENTSECRET;
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
  const responseData = await response.json();
  responseData.variables[variableName].value = variableValue;
  await fetch(url, {
    method: "PUT",
    headers,
    body: JSON.stringify(responseData),
  });
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
  const response = await fetch(traktApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // go to trakt website, authorize with oauth, copy code from url
      code: "a17defbf013ae9701ab3281e579799812b28c888e16f161ba0d8490a8c996a60",
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
  return newAccessToken;
}

getAccessToken();
