# Overview

This project consists of a PHP backend which can parse CSV files containing
bank account transaction information, and a JavaScript front-end which can
analyse and display stats about the parsed data.

# Data formats

## Backend

The backend expects a 'Statements' directory containing CSV files with the
following fields:

- Date (dd/mm/yy)
- Amount
- Description

## Frontend

The JS frontend uses a map containing one entry for each month's worth of
transactions. At present it expects this map to be assigned to a variable
called 'data'. Each month consists of an array of transactions, which are
themselves objects containing the following properties:

- Date - currently a serialisation of a PHP DateTime object, e.g. <br>
`{"date":"2009-01-05 00:00:00","timezone_type":3,"timezone":"UTC"}`
- Amount
- Description - a user-friendly description of the transaction
- RawDescription - the raw description from the statement (not used)
- Category - user-defined category for the transaction (optional)
- Type - user-defined type for the transaction (optional)

If the category has the special value `(Ignored)`, it is excluded from
certain calculates and graphs and showed as greyed out in tables.
