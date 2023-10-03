import fetch from "node-fetch";
import cheerio from "cheerio";
import dotenv from "dotenv";
import fs from "fs";
dotenv.config();

const traktClientId = process.env.TRAKTCLIENTID;
const traktClientSecret = process.env.TRAKTCLIENTSECRET;
const traktAccessToken = process.env.TRAKTACCESSTOKEN;
const tmdbApiKey = process.env.TMDBAPIKEY;

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

async function saveKeyToFile(key) {
  const content = `${key}\n`;
  try {
    await fs.writeFileSync("accessToken.txt", content, "utf-8");
    console.log(`Key '${key}' has been saved to accessToken.txt`);
  } catch (error) {
    console.error(`Error saving key to file: ${error.message}`);
  }
}

const addToTrakt = async (movieTitles) => {
  // const newTraktToken = await getAccessToken(
  //   traktAccessToken,
  //   traktClientId,
  //   traktClientSecret
  // );
  const newTraktToken = '273c41f3148a45bbbc0a1e8f16f5aa55afbf75305504a3c141be8d8195751ee2'
  await saveKeyToFile(newTraktToken);
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
  const moviesInChunks = [];
  for (let i = 0; i < movies.length; i += 10) {
    moviesInChunks.push(movies.slice(i, i + 10));
  }
  for (const moviesChunk of moviesInChunks) {
    const requestBody = {
      movies: moviesChunk,
    };
    await fetch(traktApiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });
  }
  console.log(response);
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

async function getAccessToken(refreshToken, clientId, clientSecret) {
  const traktApiUrl = "https://api.trakt.tv/oauth/token";

  try {
    const response = await fetch(traktApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const responseData = await response.json();
    const accessToken = responseData.access_token;

    console.log("Access Token:", accessToken);
    return accessToken;
  } catch (error) {
    console.error("Error getting access token:", error.message);
    throw error;
  }
}

exportToTrakt();
