import test from 'node:test';
import assert from 'node:assert/strict';
import { detectMovieRequest } from '../src/detection/movieRequestDetector.js';

test('detects standard movie title with release year', () => {
  const result = detectMovieRequest('Leo 2023');
  assert.equal(result.isMatch, true);
  assert.equal(result.detectedYear, 2023);
  assert.ok(result.confidence >= 0.8);
});

test('detects movie title with quality format tag', () => {
  const result = detectMovieRequest('Interstellar 1080p');
  assert.equal(result.isMatch, true);
  assert.ok(result.detectedQuality?.toLowerCase().includes('1080p'));
});

test('detects multi-word blockbuster titles', () => {
  const result1 = detectMovieRequest('Avengers Endgame');
  assert.equal(result1.isMatch, true);

  const result2 = detectMovieRequest('Dune: Part Two (2024)');
  assert.equal(result2.isMatch, true);
  assert.equal(result2.detectedYear, 2024);
});

test('detects multilingual and Unicode movie queries', () => {
  const result1 = detectMovieRequest('RRR 2022');
  assert.equal(result1.isMatch, true);
  assert.equal(result1.detectedYear, 2022);

  const result2 = detectMovieRequest('K.G.F: Chapter 2 720p');
  assert.equal(result2.isMatch, true);

  const result3 = detectMovieRequest('Amélie');
  assert.equal(result3.isMatch, true);
});

test('rejects bot commands starting with /', () => {
  assert.equal(detectMovieRequest('/start').isMatch, false);
  assert.equal(detectMovieRequest('/help').isMatch, false);
  assert.equal(detectMovieRequest('/movie Leo 2023').isMatch, false);
});

test('rejects routine chat greetings and conversation fillers', () => {
  assert.equal(detectMovieRequest('hi').isMatch, false);
  assert.equal(detectMovieRequest('hello anyone here').isMatch, false);
  assert.equal(detectMovieRequest('good morning').isMatch, false);
  assert.equal(detectMovieRequest('thanks').isMatch, false);
  assert.equal(detectMovieRequest('thank you so much').isMatch, false);
  assert.equal(detectMovieRequest('how to download').isMatch, false);
  assert.equal(detectMovieRequest('link not working').isMatch, false);
});

test('rejects links, URLs, and executable attachments', () => {
  assert.equal(detectMovieRequest('https://example.com/movie').isMatch, false);
  assert.equal(detectMovieRequest('join my channel t.me/joinchat/xyz').isMatch, false);
  assert.equal(detectMovieRequest('download movie.apk').isMatch, false);
  assert.equal(detectMovieRequest('@admin please help').isMatch, false);
});

test('rejects empty strings, whitespace, or pure punctuation/numbers', () => {
  assert.equal(detectMovieRequest('').isMatch, false);
  assert.equal(detectMovieRequest('   ').isMatch, false);
  assert.equal(detectMovieRequest('???').isMatch, false);
  assert.equal(detectMovieRequest('12345').isMatch, false);
});

test('respects minLength and maxLength limits', () => {
  // Too short (< 2)
  assert.equal(detectMovieRequest('A', { minLength: 2 }).isMatch, false);

  // Too long (> 40)
  const longSentence = 'This is an excessively long message describing some random thoughts about cinematography and actors in general';
  assert.equal(detectMovieRequest(longSentence, { maxLength: 40 }).isMatch, false);
});

test('matches custom admin patterns when supplied', () => {
  const result = detectMovieRequest('requesting: Inception', {
    customPatterns: [/^requesting:\s+.+/i],
  });
  assert.equal(result.isMatch, true);
  assert.ok(result.reason.includes('custom'));
});
