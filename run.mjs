import fetch from "node-fetch";
import cheerio from "cheerio";
import dotenv from "dotenv";
dotenv.config();

const traktClientId = process.env.TRAKTCLIENTID;
const traktClientSecret = process.env.TRAKTCLIENTSECRET;
const tmdbApiKey = process.env.TMDBAPIKEY;
const traktRefreshToken = process.env.TRAKTREFRESHTOKEN;
const letterboxdUsername = process.env.LETTERBOXDUSERNAME;
let newAccessToken;
let newRefreshToken;

async function exportToTrakt() {
  const movieTitles = [
    ...(await fetchAndParseAllWatchlistPages(
      "https://letterboxd.com/ayygux/watchlist/"
    )),
    ...(await fetchAndParseAllWatchlistPages(
      "https://letterboxd.com/yanhut/watchlist/"
    )),
    ...(await fetchAndParseAllWatchlistPages(
      "https://letterboxd.com/ayygux/list/alyssas-2023-criterion-challenge/"
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
    const tmdbMovieDetails = await fetchMovieDetailsFromTMDb(movieTitle);
    const traktMovieDetails = await fetchTraktMovieDetails(movieTitle);
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
  console.log("Movies successfully added to Trakt watchlist");
}

async function fetchAndParseAllWatchlistPages(url) {
  const response = await fetch(url);
  const watchlistPage = await response.text();
  const $ = cheerio.load(watchlistPage);
  const lastPage = parseInt($("li.paginate-page").last().text(), 10);
  const allMovieTitles = [];
  for (let currentPage = 1; currentPage <= lastPage; currentPage++) {
    const pageHtmlResponse = await fetch(
      `https://letterboxd.com/${letterboxdUsername}/watchlist/page/${currentPage}/`
    );
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

async function fetchMovieDetailsFromTMDb(movieTitle) {
  const response = await fetch(
    `https://api.themoviedb.org/3/search/movie?api_key=${tmdbApiKey}&query=${encodeURIComponent(
      movieTitle
    )}`
  );
  const data = await response.json();
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
  return null;
}

async function fetchTraktMovieDetails(movieTitle) {
  const response = await fetch(
    `https://api.trakt.tv/search/movie?query=${encodeURIComponent(movieTitle)}`,
    {
      timeout: 75000,
      headers: {
        "Content-Type": "application/json",
        "trakt-api-version": "2",
        "trakt-api-key": traktClientId,
      },
    }
  );
  const data = await response.json();
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
  console.log(`Variable '${variableName}' updated successfully.`);

  console.log(`Current ${variableName}: ${variableValue}`);
}

exportToTrakt();
