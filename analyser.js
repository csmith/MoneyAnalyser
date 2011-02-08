var previousPoint = null;
var state = {};
var plots = {};

// -----------------------------------------------------------------------------
// ------------------ Date handling --------------------------------------------
// -----------------------------------------------------------------------------

Date.prototype.months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Formats this date as year and two digit month, separated by a '-'.
 *
 * @return This date formatted as a key
 */
Date.prototype.getKey = function() {
 return this.getFullYear() + '-' + (this.getMonth() < 9 ? '0' : '') + (this.getMonth() + 1);
}

/**
 * Gets a textual representation of this date's month
 *
 * @return This date's month name
 */
Date.prototype.getDisplayMonth = function() {
 return this.months[this.getMonth()];
}

/**
 * Gets a textual representation of the range of months between this date and
 * the specified other. It is assumed that the other date will occur after this.
 *
 * @param {Date} other The end date
 * @return {String} A textual representation of the date range
 */
Date.prototype.getRangeText = function(other) {
 if (this.getFullYear() == other.getFullYear() && this.getMonth() == other.getMonth()) {
  return this.getDisplayMonth() + ' ' + this.getFullYear();
 } else if (this.getFullYear() == other.getFullYear()) {
  return this.getDisplayMonth() + '-' + other.getDisplayMonth() + ' ' + this.getFullYear();
 } else {
  return this.getDisplayMonth() + ' ' + this.getFullYear() + ' - ' +  other.getDisplayMonth() + ' ' + other.getFullYear();
 }
}

/**
 * Gets a date object corresponding to the specified timestamp. If advanceToNext
 * is specified, and the timestamp doesn't already correspond to the first of
 * the month, the date is forwarded to the first day of the next month.
 *
 * @param {int} timestamp The timestamp to convert to a date
 * @param {bool} advanceToNext Whether to advance to the 1st or not
 * @return {Date} A corresponding date object
 */
function getDate(timestamp, advanceToNext) {
 var date = new Date(timestamp);

 if (advanceToNext && date.getDate() > 1) {
  date.setDate(1);
  date.getMonth() == 11 && date.setYear(date.getFullYear() + 1);
  date.setMonth(date.getMonth() == 11 ? 0 : date.getMonth() + 1);
 }

 return date;
}

// -----------------------------------------------------------------------------
// ------------------ Data handling --------------------------------------------
// -----------------------------------------------------------------------------

/**
 * Calculates the sum of transactions belonging to each category within
 * the specified data.
 *
 * @param data An array of transactions to include
 * @param {bool} incoming True to tally income, false to tally expenses
 * @return A mapping of categories to the sum of their transactions
 */
function getCategoryTotals(data, incoming) {
 var catData = {};

 $.each(data, function() {
  trans = this;
  var category = trans.Category ? trans.Category : 'Unsorted';

  if (category != '(Ignored)' && incoming == trans.Amount > 0) {
    if (!catData[category]) { catData[category] = 0; }
    catData[category] += Math.abs(trans.Amount);
  }
 });

 return catData;
}

/**
 * Retrieves an array of transactions which occur between the specified two
 * dates. This has a resolution of a month -- any data in the same month
 * as the start date will be included, and any data after the month of the
 * end date will be excluded.
 *
 * @param {Date} start The date to start including data at
 * @param {Date} end The date to stop including data at
 * @return An array of transactions between the two dates
 */
function getDataForRange(start, end) {
 var include = false;
 var included = [];
 $.each(data, function(month, monthData) {
  include |= month == start.getKey();

  if (include) {
   $.each(monthData, function(index, trans) {
    included.push(trans);
   });
  }

  include &= month != end.getKey();
 });

 return included;
}

// -----------------------------------------------------------------------------
// ------------------ State handling -------------------------------------------
// -----------------------------------------------------------------------------

/**
 * Update the page's state with the specified new state. This causes the state
 * to be loaded into the user's history so they can use back and forward
 * functionality in their browser. New state is merged with the old state.
 *
 * @param newState The new properties to add to the state
 * @param invalidatedState An array of state keys to remove
 */
function setState(newState, invalidatedState) {
 $.extend(true, state, newState);

 $.each(invalidatedState, function(_, x) { delete state[x]; });

 $.history.load(JSON.stringify(state));
}

/**
 * Called when the page state changes (either via a call to $.history.load or
 * by the user manually changing the fragment or going back or forward).
 *
 * @param {string} hash The new page fragment
 */
function handleStateChange(hash) {
 var oldState = $.extend({}, state);

 try {
  state = JSON.parse(hash);
 } catch (ex) {
  state = {};
 }

 if (state.start && state.end && state.type) {
  // Update the transaction table and pie charts
  showSelectedMonths(state.start, state.end, state.type == 'income', state.type == 'expenses', state.categoryFilter, state.expanded);

  // If the selection has changed, update the visual representation
  (oldState.start != state.start || oldState.end != state.end) && plots.history.setSelection({ xaxis: { from: state.start, to: state.end }});
 }
}

// -----------------------------------------------------------------------------

/**
 * Adds an 'alt' class to every other visible row in the specified table.
 *
 * @param table The table to be marked-up
 */
function colourTableRows(table) {
 $('tr', table).removeClass('alt');
 $('tr:visible:even', table).addClass('alt');
}

/**
 * Shows a tooltip with the specified content at the given co-ordinates.
 *
 * @param {int} x The x co-ordinate to show the tooltip at
 * @param {int} y The y co-ordinate to show the tooltip at
 * @param contents The content to display in the tooltip element
 */
function showTooltip(x, y, contents) {
 $('<div id="tooltip">' + contents + '</div>').css( {
  position: 'absolute',
  display: 'none',
  top: y + 5,
  left: x + 5,
  border: '1px solid #fdd',
  padding: '2px',
  'background-color': '#fee',
 }).appendTo("body").fadeIn(200);
}

/**
 * Called when the user clicks on the expand/contract toggle on a transaction
 * line where similar entries have been merged.
 *
 * @param event The corresponding event
 */
function expandLinkHandler(event) {
 var text = $(this).text();
 var expanded = text.substr(0, 2) == '(+';

 if (!state.expanded) {
  state.expanded = {};
 }

 if (expanded) {
  state.expanded[event.data.id] = true;
  setState({}, []);
 } else {
  delete state.expanded[event.data.id];
  setState({}, []);
 }

 colourTableRows($('#historytable'));
 return false;
}

/**
 * Determines if the two transactions should be merged together. That is,
 * whether the transactions have an identical description, type and category.
 *
 * @param a The first transaction
 * @param b The second transaction
 * @return True if the transactions should be merged, false otherwise
 */
function shouldMerge(a, b) {
 return a.Description == b.Description && a.Type == b.Type && a.Category == b.Category;
}

/**
 * Draws a pie chart of transactions by category.
 *
 * @param included An array of transactions to include in the chart
 * @param incoming True to show income, false to show expenses
 */
function drawCategoryPieChart(included, incoming) {
 var pieData = getCategoryTotals(included, incoming);
 var seriesData = [];
 $.each(pieData, function(category, amount) {
  seriesData.push({ label: category + ' (' + Math.round(amount) + ')', data: amount });
 });

 seriesData.sort(function(a, b) { return b.data - a.data; });

 plots.expense = $.plot($('#expense'), seriesData, {
   series: { pie: { show: true, innerRadius: 0.5, highlight: { opacity: 0.5 } } },
   grid: { clickable: true }
 });
}

/**
 * Displays transactions and draws a category pie chart for the specified
 * date range. Note that dates have a granularity of a month.
 *
 * @param {int} start The timestamp to start including transactions from
 * @param {int} end The timestamp to stop including transactions at
 * @param {bool} incoming Whether or not to include incoming transactions (income)
 * @param {bool} outgoing Whether or not to include outgoing transactions (expenses)
 * @param {string} categoryFilter The category to filter transactions to (or null)
 * @param expanded An object containing entries indicating which merged
 *                 transactions should be shown as expanded
 */
function showSelectedMonths(start, end, incoming, outgoing, categoryFilter, expanded) {
 $('#historytable tr.data').remove();
 $('#historytable').show();

 expanded = expanded || [];

 var startDate = getDate(start, 1), endDate = getDate(end);

 $('#historytable h3').text((categoryFilter ? categoryFilter + ' t' : 'T') + 'ransactions for ' + startDate.getRangeText(endDate));

 var table = $('#historytable table');
 var lastEntry = {};
 var id = 0;
 var included = getDataForRange(startDate, endDate);

 $.each(included, function() {
  trans = this;
  if (incoming != trans.Amount > 0) { return; }

  var category = trans.Category ? trans.Category : 'Unsorted';

  if (categoryFilter && categoryFilter != category) { return; }

  var tr = $('<tr/>').addClass('data').addClass('category' + category.replace(/[^a-zA-Z]*/g, '')).appendTo(table);

  if (shouldMerge(lastEntry, trans)) {
   if (lastEntry.id) {
    var prefix = '(' + (expanded[lastEntry.id] ? '-' : '+');
    lastEntry.count++;
    $('span', lastEntry.tr).text(prefix + lastEntry.count + ')');
   } else {
    lastEntry.id = ++id;
    lastEntry.count = 1;
    var prefix = '(' + (expanded[lastEntry.id] ? '-' : '+');
    var a = $('<span>').addClass('link').text(prefix + '1)').appendTo($('td.desc', lastEntry.tr).append(' '));
    a.bind('click', { id: lastEntry.id, tr: lastEntry.tr }, expandLinkHandler);
   }

   lastEntry.Amount = Math.round(100 * (lastEntry.Amount + trans.Amount)) / 100;

   !expanded[lastEntry.id] && tr.hide() && $('.amount', lastEntry.tr).text(lastEntry.Amount);

   tr.addClass('collapsed hidden' + lastEntry.id);
  } else {
    lastEntry = $.extend({}, trans, {tr: tr});
  }

  $('<td/>').text(trans.Date.date.split(' ')[0]).appendTo(tr);
  $('<td/>').text(trans.Type ? trans.Type : 'Other').appendTo(tr);
  $('<td/>').text(trans.Category ? trans.Category : '').appendTo(tr);
  $('<td/>').addClass('desc').text(trans.Description).appendTo(tr);
  $('<td/>').addClass('amount').text(trans.Amount).appendTo(tr);
 });

 colourTableRows(table);
 drawCategoryPieChart(included, incoming);
}

$(function() {
 var transData = [{label: 'Income', data: []}, {label: 'Expense', data: []}, {label: 'Difference', data: []}];
 var categories = {};
 var min = new Date().getTime(), max = 0;

 $.each(data, function(month, entries) {
  var split = month.split('-');
  var timestamp = new Date(split[0], split[1] - 1).getTime();
  var sum = [0, 0];

  $.each(entries, function() {
   if (this.Category == '(Ignored)') { return; }

   if (this.Amount < 0) {
    var category = this.Category ? this.Category : 'Unsorted';
    if (!categories[category]) { categories[category] = {}; }
    if (!categories[category][timestamp]) { categories[category][timestamp] = 0; }
    categories[category][timestamp] -= this.Amount;
   }

   sum[this.Amount < 0 ? 1 : 0] += this.Amount;
  });

  transData[0].data.push([timestamp, sum[0]]);
  transData[1].data.push([timestamp, sum[1]]);
  transData[2].data.push([timestamp, sum[0] + sum[1]]);
  min = Math.min(min, timestamp);
  max = Math.max(max, timestamp);
 });

 var catData = [];
 $.each(categories, function(category, entries) {
  var series = {label: category, data: []};
  var total = 0;

  $.each(transData[0].data, function() {
   var timestamp = this[0];
   var val = entries[timestamp] ? entries[timestamp] : 0;
   total += val;
   series.data.push([timestamp, val]);
  });

  series.total = total;

  catData.push(series);
 });

 var markings = [];

 // Add a marking for each year division
 var year = new Date(new Date(max).getFullYear(), 0);
 while (year.getTime() > min) {
  markings.push({ color: '#000', lineWidth: 1, xaxis: { from: year.getTime(), to: year.getTime() } });
  year.setFullYear(year.getFullYear() - 1);
 }

 catData.sort(function(a, b) { return a.total - b.total; });

 plots.cathistory = $.plot($('#cathistory'), catData, {
   xaxis: { mode: 'time', timeformat: '%y/%m' },
   legend: { noColumns: 2 },
   series: {
     stack: true,
     lines: { show: true, fill: true }
   },
   grid: {
    markings: markings
   }
 });

 markings.push({ color: '#000', lineWidth: 1, yaxis: { from: 0, to: 0 } });

 plots.history = $.plot($('#history'), transData, {
   xaxis: { mode: 'time', timeformat: '%y/%m' },
   series: {
     lines: { show: true, fill: true },
     points: { show: true }
   },
   legend: { noColumns: 3, position: 'nw' },
   grid: {
     hoverable: true,
     clickable: true,
     markings: markings
   },
   selection: { mode : "x" }
 });

 $("#history").bind("plothover", function (event, pos, item) {
  if (item) {
   var id = {dataIndex: item.dataIndex, seriesIndex: item.seriesIndex};

   if (previousPoint == null || previousPoint.dataIndex != id.dataIndex || previousPoint.seriesIndex != id.seriesIndex) {
    previousPoint = id;

    $("#tooltip").remove();
    var x = item.datapoint[0],
        y = item.datapoint[1].toFixed(2);

    var date = new Date(x);

    var seriesTitles = ["Money in", "Money out", "Balance change"];
    showTooltip(item.pageX, item.pageY, (seriesTitles[item.seriesIndex]) + " during " + months[date.getMonth()] + " " + date.getFullYear() + " = " + y);
   }
  } else {
   $("#tooltip").remove();
   previousPoint = null;
  }
 });

 $('#history').bind('plotselected', function(event, ranges) {
  var startDate = parseInt(ranges.xaxis.from.toFixed());
  var endDate = parseInt(ranges.xaxis.to.toFixed());

  if (state.start != startDate || state.end != endDate || state.type != 'expenses') {
   setState({ start: startDate, end: endDate, type: 'expenses' }, ['categoryFilter', 'expanded']);
  }
 });

 $('#history').bind('plotclick', function(event, pos, item) {
  if (item) {
   setState({ start: item.datapoint[0], end: item.datapoint[0], type: item.seriesIndex == 0 ? 'income' : 'expenses' }, ['categoryFilter', 'expanded']);
  }
 });

 $('#expense').bind('plotclick', function(event, pos, item) {
  setState({ categoryFilter: item.series.label.replace(/ \([0-9]+\)$/, '') }, ['expanded']);
 });

 $.history.init(handleStateChange);
});
