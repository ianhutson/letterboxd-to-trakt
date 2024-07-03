import fetch from "node-fetch";
import cheerio from "cheerio";
import dotenv from "dotenv";
import fs from "fs";
dotenv.config();

const traktClientId = process.env.TRAKTCLIENTID;
const traktClientSecret = process.env.TRAKTCLIENTSECRET;
const tmdbApiKey = process.env.TMDBAPIKEY;
const traktRefreshToken = process.env.TRAKTREFRESHTOKEN;
let newAccessToken;
let newRefreshToken;
let notFoundFromTmdb = [];
let notFoundFromTrakt = [];

async function exportToTrakt() {
  const movieTitles = [
    ...(await fetchAndParseAllWatchlistPages(
      "https://letterboxd.com/ayygux/watchlist/"
    )),
    ...(await fetchAndParseAllWatchlistPages(
      "https://letterboxd.com/yanhut/watchlist/"
    )),
  ];
  const newTraktToken = await getAccessTokenWithRefresh();
  const traktApiUrl = "https://api.trakt.tv/sync/watchlist";
  const headers = {
    "Content-Type": "application/json",
    "trakt-api-version": "2",
    "trakt-api-key": traktClientId,
    Authorization: `Bearer ${newTraktToken}`,
  };
  const movies = [];
  for (const movieTitle of movieTitles) {
    const tmdbMovieDetails = await fetchMovieDetailsFromTmdb(movieTitle.trim());
    const traktMovieDetails = await fetchTraktMovieDetails(movieTitle.trim());
    if (tmdbMovieDetails && traktMovieDetails) {
      movies.push({
        title: tmdbMovieDetails.title,
        year: tmdbMovieDetails.year,
        ids: {
          tmdb: tmdbMovieDetails.ids.tmdb,
          trakt: traktMovieDetails.ids.trakt,
          imdb: traktMovieDetails.ids.imdb,
          slug: traktMovieDetails.ids.slug,
        },
      });
    }
  }
  const requestBody = {
    movies: movies,
  };
  const response = await fetch(traktApiUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });
  if (notFoundFromTmdb.length > 0) {
    console.log("The following were not found from tmdb-");
    for (const movie of notFoundFromTmdb) {
      console.log(movie);
    }
  }
  if (notFoundFromTrakt.length > 0) {
    console.log("===================");
    console.log("The following were not found from trakt-");
    for (const movie of notFoundFromTrakt) {
      if (!notFoundFromTmdb.includes(movie)) {
        console.log(movie);
      }
    }
  }
  console.log("Finished adding movies to Trakt.");
}

async function fetchAndParseAllWatchlistPages(url) {
  const response = await fetch(url);
  const watchlistPage = await response.text();
  const $ = cheerio.load(watchlistPage);
  const lastPage = parseInt($("li.paginate-page").last().text(), 10);
  const allMovieTitles = [];
  if (url.includes("watchlist")) {
    for (let currentPage = 1; currentPage <= lastPage; currentPage++) {
      const pageHtmlResponse = await fetch(`${url}/page/${currentPage}/`);
      const pageHtml = await pageHtmlResponse.text();
      const $ = cheerio.load(pageHtml);
      const movieTitles = [];
      $(".poster-list .film-poster").each((index, element) => {
        const titleSlug = $(element).attr("data-film-slug");
        movieTitles.push(titleSlug);
      });
      allMovieTitles.push(...movieTitles);
    }
  } else {
    const pageHtmlResponse = await fetch(`${url}`);
    const pageHtml = await pageHtmlResponse.text();
    const $ = cheerio.load(pageHtml);
    const movieTitles = [];
    $(".poster-list .film-poster").each((index, element) => {
      const titleSlug = $(element).attr("data-film-slug");
      movieTitles.push(titleSlug);
    });
    allMovieTitles.push(...movieTitles);
  }
  return allMovieTitles;
}

async function fetchMovieDetailsFromTmdb(movieTitle) {
  let response = await fetch(
    `https://api.themoviedb.org/3/search/movie?api_key=${tmdbApiKey}&query=${movieTitle}`
  );
  let data = await response.json();
  if (data.results && data.results.length > 0) {
    const movie = data.results[0];
    return {
      title: movie.title,
      year: movie.release_date
        ? new Date(movie.release_date).getFullYear()
        : null,
      ids: {
        tmdb: movie.id,
      },
    };
  } else {
    const regex = /-\d{4}$/;
    let formattedTitle;
    if (regex.test(movieTitle)) {
      formattedTitle = movieTitle.slice(0, -5);
    } else {
      return;
    }
    response = await fetch(
      `https://api.themoviedb.org/3/search/movie?api_key=${tmdbApiKey}&query=${formattedTitle}`
    );
    data = await response.json();
    if (data.results && data.results.length > 0) {
      const movie = data.results[0];
      return {
        title: movie.title,
        year: movie.release_date
          ? new Date(movie.release_date).getFullYear()
          : null,
        ids: {
          tmdb: movie.id,
        },
      };
    }
    notFoundFromTmdb.push(formattedTitle);
    return null;
  }
}

async function fetchTraktMovieDetails(movieTitle) {
  const formattedTitle = movieTitle.replace(/-/g, " ");
  let response = await fetch(
    `https://api.trakt.tv/search/movie?query=${formattedTitle}`,
    {
      timeout: 75000,
      headers: {
        "Content-Type": "application/json",
        "trakt-api-version": "2",
        "trakt-api-key": traktClientId,
      },
    }
  );
  let data = await response.json();
  if (data && data.length > 0) {
    const movie = data[0].movie;
    return {
      ids: {
        trakt: movie.ids.trakt,
        imdb: movie.ids.imdb,
        slug: movie.ids.slug,
      },
    };
  }
  notFoundFromTrakt.push(formattedTitle);
  return null;
}

async function getAccessTokenWithRefresh() {
  const traktApiUrl = "https://api.trakt.tv/oauth/token";
  const response = await fetch(traktApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      refresh_token: traktRefreshToken,
      client_id: traktClientId,
      client_secret: traktClientSecret,
      redirect_uri: "https://google.com",
      grant_type: "refresh_token",
    }),
  });
  const responseData = await response.json();
  newAccessToken = await responseData.access_token;
  newRefreshToken = await responseData.refresh_token;
  console.log(`Old refresh token: ${traktRefreshToken}`);
  console.log(`New refresh token: ${newRefreshToken}`);
  console.log(`New access token: ${newAccessToken}`);
  await updateVariableGroupVariable("TRAKTACCESSTOKEN", newAccessToken);
  await updateVariableGroupVariable("TRAKTREFRESHTOKEN", newRefreshToken);
  return newAccessToken;
}

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
  if (await fs.existsSync(filePath)) {
    const envConfig = dotenv.parse(await fs.readFileSync(".env"));
    if (envConfig.hasOwnProperty(variableName)) {
      envConfig[variableName] = variableValue;
      const updatedEnvFileContent = Object.entries(envConfig)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n");
      await fs.writeFileSync(".env", updatedEnvFileContent);
    }
  }
}

exportToTrakt();
