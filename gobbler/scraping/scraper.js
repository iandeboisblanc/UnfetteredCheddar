if (Meteor.isServer) {
  Meteor.methods({
    // call giblet methods to run the giblet jobs
    runGiblet: function ( gibletID ) {
      var giblet = Giblets.findOne({_id: gibletID});
      var urlArray = giblet.url;
      
      urlArray.forEach( function ( url ) {
        // checks if urlArray is truthy. Don't proceed without truthy url data
        if (url) {          
          var webpageText = scrapePage(url);
          if (webpageText !== '') {
            var hash = hashText(webpageText);
            var pageHasChanged = compareHash(giblet, url, hash);
            if (pageHasChanged) {
              var newKeywordCounts = findKeywords(giblet.keywords, webpageText);
              var keywordDiffs = compareKeywordCounts(giblet, url, newKeywordCounts);
              if (keywordDiffs.length) {
                Meteor.call('createNotification', giblet, url, keywordDiffs);
              }
              Meteor.call('updateWebData', giblet, url, hash, newKeywordCounts);
            }
          }
        }
      });
    },

    // update the database with the updated webpage data
    updateWebData: function ( giblet, url, hash, keywordObj ) {
      var updatedUrlObj = {
        url: url,
        hash: hash,
        keywordCounts: keywordObj
      };
      var webDataCopy = giblet.webData;
      var urlProp = removeDots(url);
      webDataCopy[urlProp] = updatedUrlObj;
      Giblets.update({_id: giblet._id}, {$set: { webData: webDataCopy }});
    }
  });
}

/*
 * Scraping helper functions
 */

// remove dots from urls in order to store url strings as properties
function removeDots ( url ) {
  var dots = /\./g;
  return url.replace(/\./g, '');
}

// get all text from a url
function scrapePage ( url ) {
  var webpage = Scrape.url(url);
  if (webpage) {
    var $ = cheerio.load(webpage);
    $('script').remove();
    var webpageText = $('body').text().replace(/\n/g, ' ').replace(/\t/g, ' ').replace('  ', ' ');
  }
  return webpageText || '';
}

// hash the page text for constant time checking for updates
function hashText ( pageText ) {
  return CryptoJS.SHA1(pageText).toString();
}

// compare the current webpage hash to the previous webpage hash
function compareHash ( giblet, url, newHash ) {
  var urlProp = removeDots(url);
  return ( !giblet.webData[urlProp] || giblet.webData[urlProp].hash !== newHash );
}

// get the keyword count
function findKeywords ( keywordsArray, pageText ) {
  // convert tags to case-insensitive regular expressions
  var tagRegexArr = [];
  keywordsArray.forEach( function(tag) {
    tagRegexArr.push(new RegExp(tag, 'gi'));
  });

  var foundKeywords = [];
  tagRegexArr.forEach( function(tagRegex) {
    var matchingArr = pageText.match(tagRegex);
    foundKeywords.push(matchingArr);
  });

  var keywordsObj = {}
  foundKeywords.forEach(function(array) {
    if (array) {
      keywordsObj[array[0]] = array.length;
    }
  });

  return keywordsObj;
}

// compare the keyword count
function compareKeywordCounts ( giblet, url, newKeywordCounts ) {
  var urlProp = removeDots(url);
  var oldKeywordCounts = {};
  if (giblet.webData[urlProp]) {
    oldKeywordCounts = giblet.webData[urlProp].keywordCounts;
  }
  var keywordDiffs = [];
  for (var key in newKeywordCounts) {
    if ( !(key in oldKeywordCounts) || newKeywordCounts[key] > oldKeywordCounts[key] ) {
      keywordDiffs.push(key);
    }
  }
  return keywordDiffs;
}

function findKeywordsAndSentences (keywordsArray, pageText) {
  var allSentences = {};
  var pageArr = pageText.replace(/\s\s+/g, ' ').split(' ');

  // For each of the keywords:
  for(var i = 0; i < keywordsArray.length; i++) {
    var keywordSentences = [];
    var keyword = keywordsArray[i].trim().replace(/\s\s+/g, ' ').toLowerCase();
    var keywordArr = keyword.split(' ');

    // Iterate through the pageText
    for(var j = 0; j < pageArr.length; j++) {
      if(keywordArr[0] == pageArr[j].replace(/[^\w\s]|_/g, "").toLowerCase()) {
        var match = true;
        // If the keyword is more than one word, make sure all parts are found
        for(var k = 1; k < keywordArr.length; k++) {
          if(match) {
            if(keywordArr[k] !== pageArr[j + k].replace(/[^\w\s]|_/g, "").toLowerCase()) {
              match = false;
            }
          }
        }
        if(match) {
          var sentence = '';

          // Find the sentence text before the keyword
          var beforeMatch = '';
          var l = 1;
          while(pageArr[j-l] && pageArr[j-l].replace(/[^.\!?]/g, "").length === 0 && l < 50){
            beforeMatch += ' ' + pageArr[j-l];
            l++;
          }
          beforeMatch = beforeMatch.split(' ').reverse().join(' ');

          // Find the sentence text after the keyword
          var afterMatch = '';
          var m = 1;
          while(pageArr[j+m] && pageArr[j+m-1].replace(/[^.\!?]/g, "").length === 0 && m < 50){
            afterMatch += ' ' + pageArr[j+m];
            m++;
          }
          sentence = (beforeMatch.trim() + ' ' + pageArr[j] + ' ' + afterMatch.trim()).trim();
          // make sure we dont already have it
          if(keywordSentences.indexOf(sentence) === -1) {
            keywordSentences.push(sentence);
          }
        }
      }
    }
    allSentences[keyword] = keywordSentences;
  }
  return allSentences;
}
