<?PHP

 // Description prefixes used to indicate types
 $types = array(
  'SO - ' => 'Standing Order',
  'DD - Hbos Card Services' => 'Internal Transfer',
  'DD - ' => 'Direct Debit',
  'CHQ - ' => 'Cheque',
  'Bank Credit - ' => 'Bank Credit',
  'Bill Payment - Hfx Credit Card' => 'Internal Transfer',
  'Bill Payment - ' => 'Bill Payment',
  'DC - ' => 'Debit Card',
  'DC Cashback - ' => 'Debit Card Cashback',
  'DC Refund - ' => 'Debit Card Refund',
  'Link ATM - ' => 'Cash Withdrawal',
  'ATM - ' => 'Cash Withdrawal',
  'Faster Payment - ' => 'Transfer',
  'PAYMENT REC\'D - THANK YOU' => 'Internal Transfer',
  'DIRECT DEBIT THANK YOU' => 'Internal Transfer',
 );

 // Types where the real description should be discarded in favour
 // of the type name
 $genericTypes = array(
  'Internal Transfer',
  'Cash Withdrawal',
  'Cheque',
 );

 // Custom user rules for grouping different descriptions
 $rules = array(
  '^(?i)tesco' => 'Tesco',
  '^(?i)(sacat )?sainsbury\'?s' => 'Sainsbury\'s',
  '^(?i)marks & spencer' => 'M&S',
  '^(?i)argos' => 'Argos',
  '^(?i)subway' => 'Subway',
  '^(?i)specsavers' => 'Specsavers',
  '^(?i)adsl24' => 'ADSL 24',
  '^(?i)foxtons' => 'Foxtons',
  '^(?i)(eve online|ccp games)' => 'CCP Games',
  '^(?i)nandos' => 'Nandos',
  '^(?i)pizza express' => 'Pizza Express',
  '^(?i)steam(games|powered)\.com' => 'Steam',
  '^(?i)spotify(\.com|subs|\s)' => 'Spotify',
  '^(?i)t-\s?mobile' => 'T-Mobile',
  '^(?i)TGI Friday\'s' => 'TGI Friday\'s',
  '^(?i)wh smith' => 'WH Smiths',
  '^(?i)Codeweavers' => 'Codeweavers',
  '^(?i)Cineworld' => 'Cineworld',
  '^(?i)123-reg\.co\.uk' => '123-reg.co.uk',
  '866-321-8851' => 'Amazon Kindle',
  '(?i)Amazon Digital Dwnlds\s*amazon.co.uk' => 'Amazon MP3',
  '^(?i)Ocado' => 'Ocado',
 );

 // Categories
 $categories = array(
  'Groceries' => array('Tesco', 'Ocado', 'M&S'),
  'Home expenses' => array('T-Mobile', 'Bt Group Plc', 'Edf Energy', 'Foxtons', 'ADSL 24', 'Lb Southwark', '(?i)0800 Repair'),
  'Entertainment' => array('Amazon', 'Spotify', 'Cineworld', '(?i)sky payments', 'Steam', '(?i)play.com'),
  'Online' => array('(?i)giganews', 'Shane', '(?i)^github'),
  'Cash' => array('Cash Withdrawal'),
  'Going out' => array('(?i)tayyab', '(?i)founders arms', 'Nandos', '(?i)all bar one', 'TGI Friday\'s', '(?i)^piccolino', 'EAT & DRINK', '(?i)www.urbanbite.com'),
  'Transport' => array('(?i)ec mainline'),
  'Health/Medical' => array('Specsavers'),
  '(Ignored)' => array('Internal Transfer'),
 );

 @include('data.local.php');

 if (!function_exists('parseStatementPart')) {
  // Formats part (one field) of a transaction
  function parseStatementPart($key, $value) {
   if ($key == 'Date') {
    $format = 'd/m/' . (strlen($value) == 8 ? 'y' : 'Y');
    return DateTime::createFromFormat($format, $value)->setTime(0, 0, 0);
   } else if ($key == 'Amount') {
    return (double) $value;
   }

   return $value;
  }
 }

 if (!function_exists('parseStatementLine')) {
  // Formats an entire transaction from a statement
  function parseStatementLine($line) {
   global $categories, $genericTypes, $types, $rules;

   if (!isset($line['Exchange']) || empty($line['Exchange'])) {
    if (preg_match('/^(.*?)\s*\((.*? @ RATE .*?)\)$/', $line['Description'], $m)) {
     $line['Description'] = $m[1];
     $line['Exchange'] = $m[2];
    }
   }

   if (!isset($line['Type']) || empty($line['Type'])) {
    foreach ($types as $prefix => $type) {
     if (strpos($line['Description'], $prefix) === 0) {
      $line['Type'] = $type;

      if (array_search($type, $genericTypes) === false) {
       $line['Description'] = substr($line['Description'], strlen($prefix));
      } else {
       $line['RawDescription'] = $line['Description'];
       $line['Description'] = $type;
      }

      break;
     }
    }
   }

   foreach ($rules as $regex => $replacement) {
    if (preg_match('(' . $regex . ')', $line['Description'])) {
     $line['RawDescription'] = $line['Description'];
     $line['Description'] = $replacement;
    }
   }

   if (!isset($line['Category']) || empty($line['Category'])) {
    foreach ($categories as $cat => $entries) {
     foreach ($entries as $regex) {
      if (preg_match('(' . $regex . ')', $line['Description'])) {
       $line['Category'] = $cat;
       break;
      }
     }
    }
   }

   return $line;
  }
 }

 if (!function_exists('loadStatements')) {
  // Loads statements from the specified directory
  function loadStatements($dir = 'Statements') {
   $results = array();

   foreach (glob($dir . '/*.csv') as $statement) {
    $fh = fopen($statement, 'r');
    $data = array();

    $headers = array_map('trim', fgetcsv($fh));

    while (!feof($fh)) {
     $line = parseStatementLine(array_combine($headers, array_map('parseStatementPart', $headers, array_map('trim', fgetcsv($fh)))));
     $data[] = $line;
    }
    fclose($fh);

    $results[basename($statement)] = $data;
   }

   return $results;
  }
 }

 $entries = array_reduce(loadStatements(), 'array_merge', array());

 usort($entries, function($a, $b) { return $a['Date']->getTimestamp() - $b['Date']->getTimestamp(); });

 $descs = array_unique(array_map(function($t) { return $t['Description']; }, $entries));
 sort($descs);

 $amounts = array();
 $rawmonths = array();
 $months = array();
 $bydesc = array();
 array_walk($entries, function($entry) use(&$months, &$bydesc, &$amounts, &$rawmonths) {
  $rawmonths[$entry['Date']->format('Y-m')][] = $entry;

  if (!isset($entry['Category']) || $entry['Category'] != '(Ignored)') {
   $amounts[$entry['Date']->format('Y-m')][$entry['Amount'] < 0 ? 'out' : 'in'] += $entry['Amount'];
   $months[$entry['Date']->format('Y-m')][$entry['Description']]['Count']++; 
   $months[$entry['Date']->format('Y-m')][$entry['Description']]['Amount'] += $entry['Amount'];
   $bydesc[$entry['Description']]['Count']++;
   $bydesc[$entry['Description']]['Amount'] += $entry['Amount'];
  }
 });

 ksort($months);
 ksort($amounts);

 $monthsbydesc = array();

 array_walk(array_slice(array_reverse($months), 0, 6, true), function($monthentries, $month) use(&$monthsbydesc) {
  array_walk($monthentries, function($entry, $desc) use(&$monthsbydesc, $month) {
   $monthsbydesc[$desc][$month]['Count'] += $entry['Count'];
   $monthsbydesc[$desc][$month]['Amount'] += $entry['Amount'];
  });
 });

 $total = 0;
 array_walk($monthsbydesc, function($data, $desc) use(&$total) {
  $prob = count($data) / 6;
  $count = array_sum(array_map(function($x) { return $x['Count']; }, $data));
  $amount = array_sum(array_map(function($x) { return $x['Amount']; }, $data)); 
  $avgcount = $count / count($data);
  $avgamount = $amount / $count;
  $total += $prob * $avgcount * $avgamount;
  //echo "P($desc) = $prob, with avg of $avgcount trans/month, averaging $avgamount\n";
 });

 $transData = array(array(), array());
 array_walk($months, function($entries, $month) use(&$transData) {
  $ins = array_filter($entries, function($x) { return $x['Amount'] > 0; });
  $outs = array_filter($entries, function($x) { return $x['Amount'] < 0; });

  $totalin = array_sum(array_map(function($x) { return $x['Amount']; }, $ins));
  $totalout = array_sum(array_map(function($x) { return -1 * $x['Amount']; }, $outs));
  $time = strtotime($month . '-01') * 1000;

  $transData[0][] = array($time, $totalin);
  $transData[1][] = array($time, $totalout);
 });

?>
var data = <?PHP echo json_encode($rawmonths); ?>;
