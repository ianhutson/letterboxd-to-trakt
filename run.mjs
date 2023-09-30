import fetch from "node-fetch";
import cheerio from "cheerio";
import dotenv from "dotenv";
dotenv.config();

const traktClientId = process.env.TRAKTCLIENTID;
const traktClientSecret = process.env.TRAKTCLIENTSECRET;
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
    retryCount++;
    if (retryCount < maxRetries) {
      console.log(`Retrying request (Attempt ${retryCount + 1})...`);
      return fetchTraktMovieDetails(movieTitle);
    }
    throw error;
  }
};

const getTraktApiAccessToken = async () => {
  const tokenUrl = "https://api.trakt.tv/oauth/token";
  const headers = {
    "Content-Type": "application/json",
  };
  const body = JSON.stringify({
    client_id: traktClientId,
    client_secret: traktClientSecret,
    grant_type: "client_credentials",
  });
  try {
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: headers,
      body: body,
    });
    if (response.ok) {
      const data = await response.json();
      const accessToken = data.access_token;
      return accessToken;
    } else {
      throw new Error("Failed to obtain access token");
    }
  } catch (error) {
    console.error("Error getting access token:", error);
    throw error;
  }
};

const addToTrakt = async (movieTitles) => {
  const traktAccessToken = await getTraktApiAccessToken();
  const traktApiUrl = "https://api.trakt.tv/sync/watchlist";
  const headers = {
    "Content-Type": "application/json",
    "trakt-api-version": "2",
    "trakt-api-key": traktClientId,
    Authorization: `Bearer ${traktAccessToken}`,
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
  console.log(movies);
  const requestBody = {
    movies: movies,
  };
  const response = await fetch(traktApiUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });
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

exportToTrakt();
