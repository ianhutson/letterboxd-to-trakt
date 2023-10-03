import fetch from "node-fetch";
import cheerio from "cheerio";
import dotenv from "dotenv";
dotenv.config();

const traktClientId = process.env.TRAKTCLIENTID;
const traktClientSecret = process.env.TRAKTCLIENTSECRET;
const tmdbApiKey = process.env.TMDBAPIKEY;
let newAccessToken
let newRefreshToken

const fetchWatchlistPage = async (page) => {
  try {
    const response = await fetch(
      `https://letterboxd.com/ayygux/watchlist/page/${page}/`
    );
    const watchlistPage = await response.text();
    return watchlistPage;
  } catch (error) {
    console.error("Error fetching watchlist page:", error);
    throw error;
  }
};

const fetchAllWatchlistPages = async () => {
  const response = await fetch("https://letterboxd.com/ayygux/watchlist/");
  const watchlistPage = await response.text();
  const $ = cheerio.load(watchlistPage);
  const lastPage = parseInt($("li.paginate-page").last().text(), 10);
  const allMovieTitles = [];
  for (let currentPage = 1; currentPage <= lastPage; currentPage++) {
    const pageHtml = await fetchWatchlistPage(currentPage);
    const movieTitles = parseWatchlistPage(pageHtml);
    allMovieTitles.push(...movieTitles);
  }
  return allMovieTitles;
};

const parseWatchlistPage = (pageHtml) => {
  const $ = cheerio.load(pageHtml);
  const movieTitles = [];
  $(".poster-list .film-poster").each((index, element) => {
    const titleSlug = $(element).attr("data-film-slug");
    movieTitles.push(titleSlug);
  });
  return movieTitles;
};

const fetchMovieDetailsFromTMDb = async (movieTitle) => {
  try {
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
  } catch (error) {
    console.error("Error fetching movie details from TMDb:", error);
    throw error;
  }
};

const fetchTraktMovieDetails = async (movieTitle) => {
  try {
    const response = await fetch(
      `https://api.trakt.tv/search/movie?query=${encodeURIComponent(
        movieTitle
      )}`,
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
  } catch (error) {
    console.error("Error fetching movie details from Trakt:", error);
    let retryCount = 0;
    if (10 > retryCount) {
      console.log(`Retrying request (Attempt ${retryCount + 1})...`);
      retryCount++;
      setTimeout(() => {
        console.log("After pause");
      }, 1000);
      return fetchTraktMovieDetails(movieTitle);
    }
    throw error;
  }
};

const addToTrakt = async (movieTitles) => {
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
  const moviesBatches = [];
  for (let i = 0; i < movies.length; i += 10) {
    moviesBatches.push(movies.slice(i, i + 10));
  }
  for (const moviesBatch of moviesBatches) {
    console.log("Attempting to add the following movies-");
    console.log(moviesBatch);
    const requestBody = {
      movies: moviesBatch,
    };
    const response = await fetch(traktApiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });
    if (!response.ok) {
      console.log("Response:" + (await response.text()));
      throw new Error(
        `Error adding movies with batch ${
          moviesBatches.indexOf(moviesBatch) + 1
        } out of ${moviesBatches.length}! Status: ${response.status}`
      );
    } else {
      console.log(
        `Movies batch ${moviesBatches.indexOf(moviesBatch) + 1} out of ${
          moviesBatches.length
        } successfully added!`
      );
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
};

async function exportToTrakt() {
  try {
    const movies = await fetchAllWatchlistPages();
    await addToTrakt(movies);
    console.log("Movies added to Trakt watchlist");
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

async function getAccessTokenWithRefresh() {
  const traktApiUrl = "https://api.trakt.tv/oauth/token";
  try {
    const response = await fetch(traktApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        refresh_token: process.env.TRAKTREFRESHTOKEN,
        client_id: traktClientId,
        client_secret: traktClientSecret,
        redirect_uri: "https://google.com",
        grant_type: "refresh_token",
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
  try {
    const response = await fetch(url, { method: "GET", headers });
    const responseData = await response.clone().json();
    responseData.variables[variableName].value = variableValue;
    await fetch(url, {
      method: "PUT",
      headers,
      body: JSON.stringify(responseData),
    });
    console.log(`Variable '${variableName}' updated successfully.`);
  } catch (error) {
    console.error("Error:", error.message);
  }
}

exportToTrakt();
console.log(`Current access token: ${newAccessToken}`)
console.log(`Current refresh token: ${newRefreshToken}`)
