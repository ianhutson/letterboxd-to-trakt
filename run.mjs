import fetch from 'node-fetch';
import cheerio from 'cheerio';
import dotenv from 'dotenv';
dotenv.config();

const traktApiKey = process.env.TRAKTAPIKEY;

const fetchWatchlistPage = async (page) => {
  try {
    const response = await fetch(`https://letterboxd.com/ayygux/watchlist/page/${page}/`);
    const watchlistPage = await response.text();
    return watchlistPage;
  } catch (error) {
    console.error('Error fetching watchlist page:', error);
    throw error;
  }
};

const fetchAllWatchlistPages = async () => {
  const response = await fetch('https://letterboxd.com/ayygux/watchlist/');
  const watchlistPage = await response.text();
  const $ = cheerio.load(watchlistPage);
  const lastPage = parseInt($('li.paginate-page').last().text(), 10);
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
  $('.poster-list .film-poster').each((index, element) => {
    const titleSlug = $(element).attr('data-film-slug');
    movieTitles.push(titleSlug);
  });
  return movieTitles;
};

const addToTrakt = async (traktMovieIds) => {
  const traktApiUrl = 'https://api.trakt.tv/sync/watchlist';
  const headers = {
    'Content-Type': 'application/json',
    'trakt-api-key': traktApiKey,
    'trakt-api-version': '2',
  };
  const movies = traktMovieIds.map(traktMovieId => ({ ids: { trakt: traktMovieId } }));
  const requestBody = {
    movies: movies,
  };

  try {
    const response = await fetch(traktApiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (response.ok) {
      console.log('Added movies to Trakt watchlist');
    } 
  } catch (error) {
    console.error('An error occurred while adding movies to Trakt watchlist:', error);
  }
};

async function exportToTrakt() {
  try {
    const movieTitles = await fetchAllWatchlistPages();
    await addToTrakt(movieTitles);
    console.log('Movies added to Trakt watchlist');
  } catch (error) {
    console.error('An error occurred:', error);
  }
}

exportToTrakt();
