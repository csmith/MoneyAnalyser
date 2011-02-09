var previousPoint = null;
var state = {};
var oldState = {};
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
 * @param invalidatedSubState An map of state subkeys to remove
 */
function setState(newState, invalidatedState, invalidatedSubState) {
 oldState = $.extend(true, {}, state);

 $.extend(true, state, newState);

 invalidatedState && $.each(invalidatedState, function(_, x) { delete state[x]; });
 invalidatedSubState && $.each(invalidatedSubState, function(key, values) {
  $.each(values, function() {
   delete state[key][this];
  });
 });

 $.history.load(JSON.stringify(state));
}

/**
 * Called when the page state changes (either via a call to $.history.load or
 * by the user manually changing the fragment or going back or forward).
 *
 * @param {string} hash The new page fragment
 */
function handleStateChange(hash) {
 try {
  state = JSON.parse(hash);
 } catch (ex) {
  state = {};
 }

 if (state.start && state.end && state.type) {
  if (state.start == oldState.start && state.end == oldState.end && state.type == oldState.type && state.categoryFilter == oldState.categoryFilter) {
   // Just show/hide nodes as required
   ensureExpanded(oldState.expanded, state.expanded);
  } else {
   // Update the transaction table and pie charts
   showSelectedMonths(state.start, state.end, state.type == 'income', state.type == 'expenses', state.categoryFilter, state.expanded);
  }

  // If the selection has changed, update the visual representation
  (oldState.start != state.start || oldState.end != state.end) && plots.history.setSelection({ xaxis: { from: state.start, to: state.end }});
 }
}

// -----------------------------------------------------------------------------

/**
 * Formats the specified number in a manner suitable for a currency. That is,
 * fixed to two decimal places and with a thousand separator every 3 digits.
 *
 * @return A string representation of the number as a currency
 */
Number.prototype.toCurrency = function() {
 return this.toFixed(2).replace(/([0-9])(?=([0-9]{3})+\.)/g, '$1,');
};

/**
 * Computes the arithmatic mean, variance and deviation for the given array.
 *
 * @param a Array of numbers to be averaged
 * @return A map containing the mean, variance and deviation
 */
function getAverage(a){
 var r = {mean: 0, variance: 0, deviation: 0};
 var length = a.length;

 // Sum the array
 for (var sum = 0, i = length; i--; sum += a[i]);

 var mean = r.mean = sum / length

 // Sum the squares of the differences from the mean
 for (var i = length, sum = 0; i--; sum += Math.pow(a[i] - mean, 2));

 r.deviation = Math.sqrt(r.variance = sum / length)
 return r;
}

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

 if (expanded) {
  var newExpanded = {};
  newExpanded[event.data.id] = true;
  setState({expanded: newExpanded}, []);
 } else {
  setState({}, [], {expanded: [event.data.id]});
 }

 colourTableRows($('#historytable'));
 return false;
}

/**
 * Ensures that the desired elements are appropriately expanded or collapsed.
 *
 * @param oldList A map containing keys for each entry that was previously expanded
 * @param newList A map containing keys for each entry that should now be expanded
 */
function ensureExpanded(oldList, newList) {
 oldList = oldList || {};
 newList = newList || {};

 $.each(newList, function(id, _) {
  if (!oldList[id]) {
   // This entry needs to be expanded
   $('.hidden' + id).show();
   var handle = $('#collapseHandle' + id);
   handle.text(handle.text().replace(/\+/, '-'));
   handle.parents('tr').find('td.amount').text(parseFloat(handle.data('single')).toCurrency());
  }
 });

 $.each(oldList, function(id, _) {
  if (!newList[id]) {
   // This entry needs to be collapsed
   $('.hidden' + id).hide();
   var handle = $('#collapseHandle' + id);
   handle.text(handle.text().replace(/\-/, '+'));
   handle.parents('tr').find('td.amount').text(parseFloat(handle.data('total')).toCurrency());
  }
 });

 colourTableRows($('#historytable'));
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
 var total = 0;

 $.each(pieData, function(_, amount) { total += amount; });

 var seriesData = [];
 $.each(pieData, function(category, amount) {
  seriesData.push({ label: category + ' (&pound;' + amount.toCurrency() + ', ' + Math.floor(100 * amount / total) + '%)', data: amount });
 });

 seriesData.sort(function(a, b) { return b.data - a.data; });

 plots.expense = $.plot($('#expense'), seriesData, {
   series: { pie: { show: true, innerRadius: 0.5, highlight: { opacity: 0.5 } } },
   grid: { clickable: true }
 });
}

/**
 * Calculates repeat transactions within the specified data.
 *
 * @param data The data to be analysed
 */
function calculateRepeatTransactions(data) {
 $('#repeats').show();
 $('#repeats tr.data').remove();
 var table = $('#repeats table');

 var descs = {};

 $.each(data, function() {
  if (!descs[this.Description]) { descs[this.Description] = []; }
  descs[this.Description].push(this);
 });

 var monthTotal = 0;
 $.each(descs, function(desc) {
  // We only care if there are at least more than 2
  if (this.length < 3) { return; }

  var lastTime = 0;
  var differences = [];
  var amounts = [];

  $.each(this, function() {
   var time = new Date(this.Date.date).getTime();
   lastTime > 0 && differences.push(time - lastTime);
   lastTime = time;
   amounts.push(this.Amount);
  });

  var average = getAverage(differences);
  var averageAmount = getAverage(amounts);

  // I may have just made this metric up. Sue me.
  var stability = average.deviation / average.mean;
  var periodInDays = average.mean / (1000 * 60 * 60 * 24);

  if (stability < 0.5) {
   // Seems quite reliable...
   if ((periodInDays >= 5 && periodInDays <= 9) || (periodInDays >= 27 && periodInDays <= 32)) {
    // Roughly weekly or monthly
    var monthValue = (periodInDays <= 9 ? 4 : 1) * averageAmount.mean;

    var tr = $('<tr class="data"/>').appendTo(table);
    $('<td/>').text(desc).appendTo(tr);
    $('<td/>').text(this[0].Category ? this[0].Category : 'Unsorted').appendTo(tr);
    $('<td/>').text(periodInDays <= 9 ? 'Weekly' : 'Monthly').appendTo(tr);
    $('<td class="amount"/>').text(averageAmount.mean.toCurrency()).appendTo(tr);
    $('<td class="amount"/>').text(monthValue.toCurrency()).appendTo(tr);

    monthTotal += monthValue;
   }
  }
 });

 colourTableRows(table);
 var tr = $('<tr/>').addClass('data total').appendTo(table);
 $('<th colspan="4" class="total">Total</th>').appendTo(tr);
 $('<td class="amount"></td>').text(monthTotal.toCurrency()).appendTo(tr);
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

 var included = getDataForRange(startDate, endDate);
 var filtered = $.grep(included, function(x) {
  var category = x.Category ? x.Category : 'Unsorted';
  return (incoming == x.Amount > 0) && (!categoryFilter || categoryFilter == category);
 });

 var table = $('#historytable table');
 var total = 0;
 var lastEntry = {};
 var id = 0;
 $.each(filtered, function() {
  total += this.Amount;

  var category = this.Category ? this.Category : 'Unsorted';

  var tr = $('<tr/>').addClass('data').addClass('category' + category.replace(/[^a-zA-Z]*/g, '')).appendTo(table);

  if (shouldMerge(lastEntry, this)) {
   if (lastEntry.id) {
    var prefix = '(' + (expanded[lastEntry.id] ? '-' : '+');
    lastEntry.count++;
    $('span', lastEntry.tr).text(prefix + lastEntry.count + ')');
   } else {
    lastEntry.id = ++id;
    lastEntry.count = 1;
    var prefix = '(' + (expanded[lastEntry.id] ? '-' : '+');
    var a = $('<span>').addClass('link').text(prefix + '1)').attr('id', 'collapseHandle' + lastEntry.id).appendTo($('td.desc', lastEntry.tr).append(' '));
    a.bind('click', { id: lastEntry.id }, expandLinkHandler);
    a.data('single', lastEntry.Amount);
   }

   lastEntry.Amount = Math.round(100 * (lastEntry.Amount + this.Amount)) / 100;
   $('#collapseHandle' + lastEntry.id).data('total', lastEntry.Amount);

   !expanded[lastEntry.id] && tr.hide() && $('.amount', lastEntry.tr).text(lastEntry.Amount.toCurrency());

   tr.addClass('collapsed hidden' + lastEntry.id);
  } else {
    lastEntry = $.extend({}, this, {tr: tr});
  }

  $('<td/>').text(this.Date.date.split(' ')[0]).appendTo(tr);
  $('<td/>').text(this.Type ? this.Type : 'Other').appendTo(tr);
  $('<td/>').text(this.Category ? this.Category : '').appendTo(tr);
  $('<td/>').addClass('desc').text(this.Description).appendTo(tr);
  $('<td/>').addClass('amount').text(this.Amount.toCurrency()).appendTo(tr);
 });

 var tr = $('<tr/>').addClass('data total').appendTo(table);
 $('<th colspan="4" class="total">Total</th>').appendTo(tr);
 $('<td class="amount"></td>').text(total.toCurrency()).appendTo(tr);

 colourTableRows(table);
 drawCategoryPieChart(included, incoming);
 calculateRepeatTransactions(included);
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
    showTooltip(item.pageX, item.pageY, (seriesTitles[item.seriesIndex]) + " during " + date.getDisplayMonth() + " " + date.getFullYear() + " = " + y);
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
  setState({ categoryFilter: item.series.label.replace(/ \(.*$/, '') }, ['expanded']);
 });

 $.history.init(handleStateChange);
});
