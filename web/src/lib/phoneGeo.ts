export type GeoPoint = { lat: number; lng: number };

const AREA_CODE_TO_COORDS: Record<string, GeoPoint> = {
  "201": { lat: 40.7357, lng: -74.1724 }, // Newark, NJ
  "202": { lat: 38.9072, lng: -77.0369 }, // Washington, DC
  "203": { lat: 41.3083, lng: -72.9279 }, // New Haven, CT
  "205": { lat: 33.5186, lng: -86.8104 }, // Birmingham, AL
  "206": { lat: 47.6062, lng: -122.3321 }, // Seattle, WA
  "207": { lat: 43.6591, lng: -70.2568 }, // Portland, ME
  "208": { lat: 43.615, lng: -116.2023 }, // Boise, ID
  "209": { lat: 37.9577, lng: -121.2908 }, // Stockton, CA
  "210": { lat: 29.4241, lng: -98.4936 }, // San Antonio, TX
  "212": { lat: 40.7128, lng: -74.006 }, // New York, NY
  "213": { lat: 34.0522, lng: -118.2437 }, // Los Angeles, CA
  "214": { lat: 32.7767, lng: -96.797 }, // Dallas, TX
  "215": { lat: 39.9526, lng: -75.1652 }, // Philadelphia, PA
  "216": { lat: 41.4993, lng: -81.6944 }, // Cleveland, OH
  "217": { lat: 39.7817, lng: -89.6501 }, // Springfield, IL
  "218": { lat: 46.7867, lng: -92.1005 }, // Duluth, MN
  "219": { lat: 41.5934, lng: -87.3464 }, // Gary, IN
  "224": { lat: 42.0451, lng: -87.6877 }, // Evanston, IL
  "225": { lat: 30.4515, lng: -91.1871 }, // Baton Rouge, LA
  "228": { lat: 30.3674, lng: -89.0928 }, // Gulfport, MS
  "229": { lat: 31.5785, lng: -84.1557 }, // Albany, GA
  "231": { lat: 44.7631, lng: -85.6206 }, // Traverse City, MI
  "234": { lat: 41.0814, lng: -81.519 }, // Akron, OH
  "239": { lat: 26.6406, lng: -81.8723 }, // Fort Myers, FL
  "240": { lat: 39.1434, lng: -77.2014 }, // Rockville, MD
  "248": { lat: 42.6064, lng: -83.1498 }, // Troy, MI
  "251": { lat: 30.6954, lng: -88.0399 }, // Mobile, AL
  "252": { lat: 35.6127, lng: -77.3664 }, // Greenville, NC
  "253": { lat: 47.2529, lng: -122.4443 }, // Tacoma, WA
  "254": { lat: 31.5493, lng: -97.1467 }, // Waco, TX
  "256": { lat: 34.7304, lng: -86.5861 }, // Huntsville, AL
  "260": { lat: 41.0793, lng: -85.1394 }, // Fort Wayne, IN
  "262": { lat: 43.0389, lng: -87.9065 }, // Milwaukee metro, WI
  "267": { lat: 39.9526, lng: -75.1652 }, // Philadelphia, PA
  "269": { lat: 42.2917, lng: -85.5872 }, // Kalamazoo, MI
  "270": { lat: 36.9685, lng: -86.4808 }, // Bowling Green, KY
  "272": { lat: 41.4089, lng: -75.6624 }, // Scranton, PA
  "281": { lat: 29.7604, lng: -95.3698 }, // Houston, TX
  "301": { lat: 39.1434, lng: -77.2014 }, // Rockville, MD
  "302": { lat: 39.7391, lng: -75.5398 }, // Wilmington, DE
  "303": { lat: 39.7392, lng: -104.9903 }, // Denver, CO
  "304": { lat: 38.3498, lng: -81.6326 }, // Charleston, WV
  "305": { lat: 25.7617, lng: -80.1918 }, // Miami, FL
  "307": { lat: 41.14, lng: -104.8202 }, // Cheyenne, WY
  "308": { lat: 40.8136, lng: -96.7026 }, // Lincoln, NE
  "309": { lat: 40.6936, lng: -89.589 }, // Peoria, IL
  "310": { lat: 34.0195, lng: -118.4912 }, // Santa Monica, CA
  "312": { lat: 41.8781, lng: -87.6298 }, // Chicago, IL
  "313": { lat: 42.3314, lng: -83.0458 }, // Detroit, MI
  "314": { lat: 38.627, lng: -90.1994 }, // St. Louis, MO
  "315": { lat: 43.0481, lng: -76.1474 }, // Syracuse, NY
  "316": { lat: 37.6872, lng: -97.3301 }, // Wichita, KS
  "317": { lat: 39.7684, lng: -86.1581 }, // Indianapolis, IN
  "318": { lat: 32.5252, lng: -93.7502 }, // Shreveport, LA
  "319": { lat: 41.9779, lng: -91.6656 }, // Cedar Rapids, IA
  "320": { lat: 45.5539, lng: -94.17 }, // St. Cloud, MN
  "321": { lat: 28.5383, lng: -81.3792 }, // Orlando, FL
  "323": { lat: 34.0522, lng: -118.2437 }, // Los Angeles, CA
  "330": { lat: 41.0814, lng: -81.519 }, // Akron, OH
  "331": { lat: 41.7606, lng: -88.3201 }, // Aurora, IL
  "334": { lat: 32.3792, lng: -86.3077 }, // Montgomery, AL
  "336": { lat: 36.0726, lng: -79.792 }, // Greensboro, NC
  "337": { lat: 30.2241, lng: -92.0198 }, // Lafayette, LA
  "339": { lat: 42.3601, lng: -71.0589 }, // Boston metro
  "346": { lat: 29.7604, lng: -95.3698 }, // Houston, TX
  "347": { lat: 40.7128, lng: -74.006 }, // NYC outer boroughs
  "351": { lat: 42.6334, lng: -71.3162 }, // Lowell, MA
  "352": { lat: 29.6516, lng: -82.3248 }, // Gainesville, FL
  "360": { lat: 47.0379, lng: -122.9007 }, // Olympia, WA
  "361": { lat: 27.8006, lng: -97.3964 }, // Corpus Christi, TX
  "386": { lat: 29.2108, lng: -81.0228 }, // Daytona Beach, FL
  "401": { lat: 41.824, lng: -71.4128 }, // Providence, RI
  "402": { lat: 41.2565, lng: -95.9345 }, // Omaha, NE
  "404": { lat: 33.749, lng: -84.388 }, // Atlanta, GA
  "405": { lat: 35.4676, lng: -97.5164 }, // Oklahoma City, OK
  "406": { lat: 46.5891, lng: -112.0391 }, // Helena, MT
  "407": { lat: 28.5383, lng: -81.3792 }, // Orlando, FL
  "408": { lat: 37.3382, lng: -121.8863 }, // San Jose, CA
  "409": { lat: 29.3013, lng: -94.7977 }, // Galveston, TX
  "410": { lat: 39.2904, lng: -76.6122 }, // Baltimore, MD
  "412": { lat: 40.4406, lng: -79.9959 }, // Pittsburgh, PA
  "413": { lat: 42.1015, lng: -72.5898 }, // Springfield, MA
  "414": { lat: 43.0389, lng: -87.9065 }, // Milwaukee, WI
  "415": { lat: 37.7749, lng: -122.4194 }, // San Francisco, CA
  "417": { lat: 37.2089, lng: -93.2923 }, // Springfield, MO
  "419": { lat: 41.6528, lng: -83.5379 }, // Toledo, OH
  "424": { lat: 34.0195, lng: -118.4912 }, // Santa Monica, CA
  "425": { lat: 47.6101, lng: -122.2015 }, // Bellevue, WA
  "430": { lat: 32.3513, lng: -95.3011 }, // Tyler, TX
  "432": { lat: 31.9973, lng: -102.0779 }, // Midland, TX
  "434": { lat: 37.5407, lng: -77.436 }, // Richmond, VA
  "435": { lat: 37.0965, lng: -113.5684 }, // St. George, UT
  "440": { lat: 41.411, lng: -81.8601 }, // Cleveland suburbs
  "443": { lat: 39.2904, lng: -76.6122 }, // Baltimore, MD
  "469": { lat: 32.7767, lng: -96.797 }, // Dallas, TX
  "470": { lat: 33.749, lng: -84.388 }, // Atlanta, GA
  "475": { lat: 41.7658, lng: -72.6734 }, // Hartford, CT
  "478": { lat: 32.8407, lng: -83.6324 }, // Macon, GA
  "479": { lat: 36.0822, lng: -94.1719 }, // Fayetteville, AR
  "480": { lat: 33.4255, lng: -111.94 }, // Mesa, AZ
  "484": { lat: 40.0379, lng: -75.3057 }, // Main Line, PA
  "501": { lat: 34.7465, lng: -92.2896 }, // Little Rock, AR
  "502": { lat: 38.2527, lng: -85.7585 }, // Louisville, KY
  "503": { lat: 45.5152, lng: -122.6784 }, // Portland, OR
  "504": { lat: 29.9511, lng: -90.0715 }, // New Orleans, LA
  "505": { lat: 35.0844, lng: -106.6504 }, // Albuquerque, NM
  "507": { lat: 44.0121, lng: -92.4802 }, // Rochester, MN
  "508": { lat: 42.2626, lng: -71.8023 }, // Worcester, MA
  "509": { lat: 47.6588, lng: -117.426 }, // Spokane, WA
  "510": { lat: 37.8044, lng: -122.2711 }, // Oakland, CA
  "512": { lat: 30.2672, lng: -97.7431 }, // Austin, TX
  "513": { lat: 39.1031, lng: -84.512 }, // Cincinnati, OH
  "515": { lat: 41.5868, lng: -93.625 }, // Des Moines, IA
  "516": { lat: 40.7282, lng: -73.7949 }, // Nassau County, NY
  "517": { lat: 42.7325, lng: -84.5555 }, // Lansing, MI
  "518": { lat: 42.6526, lng: -73.7562 }, // Albany, NY
  "520": { lat: 32.2226, lng: -110.9747 }, // Tucson, AZ
  "530": { lat: 39.7285, lng: -121.8375 }, // Chico, CA
  "531": { lat: 41.2565, lng: -95.9345 }, // Omaha, NE
  "541": { lat: 44.0582, lng: -121.3153 }, // Bend, OR
  "551": { lat: 40.7282, lng: -74.0776 }, // Jersey City, NJ
  "559": { lat: 36.7378, lng: -119.7871 }, // Fresno, CA
  "561": { lat: 26.7153, lng: -80.0534 }, // West Palm Beach, FL
  "562": { lat: 33.7701, lng: -118.1937 }, // Long Beach, CA
  "563": { lat: 41.5236, lng: -90.5776 }, // Davenport, IA
  "567": { lat: 41.6528, lng: -83.5379 }, // Toledo, OH
  "570": { lat: 41.2459, lng: -75.8813 }, // Wilkes-Barre, PA
  "571": { lat: 38.8048, lng: -77.0469 }, // Alexandria, VA
  "573": { lat: 38.5767, lng: -92.1735 }, // Jefferson City, MO
  "574": { lat: 41.6764, lng: -86.252 }, // South Bend, IN
  "575": { lat: 32.3199, lng: -106.7637 }, // Las Cruces, NM
  "580": { lat: 34.6036, lng: -98.3959 }, // Lawton, OK
  "585": { lat: 43.1566, lng: -77.6088 }, // Rochester, NY
  "586": { lat: 42.5803, lng: -83.0302 }, // Warren, MI
  "601": { lat: 32.2988, lng: -90.1848 }, // Jackson, MS
  "602": { lat: 33.4484, lng: -112.074 }, // Phoenix, AZ
  "603": { lat: 43.2081, lng: -71.5376 }, // Concord, NH
  "605": { lat: 43.5446, lng: -96.7311 }, // Sioux Falls, SD
  "606": { lat: 38.0406, lng: -84.5037 }, // Lexington, KY
  "607": { lat: 42.0987, lng: -75.918 }, // Binghamton, NY
  "608": { lat: 43.0731, lng: -89.4012 }, // Madison, WI
  "609": { lat: 40.2171, lng: -74.7429 }, // Trenton, NJ
  "610": { lat: 40.0379, lng: -75.3057 }, // Allentown/Philly suburbs
  "612": { lat: 44.9778, lng: -93.265 }, // Minneapolis, MN
  "614": { lat: 39.9612, lng: -82.9988 }, // Columbus, OH
  "615": { lat: 36.1627, lng: -86.7816 }, // Nashville, TN
  "616": { lat: 42.9634, lng: -85.6681 }, // Grand Rapids, MI
  "617": { lat: 42.3601, lng: -71.0589 }, // Boston, MA
  "618": { lat: 38.6245, lng: -90.1506 }, // Southern IL
  "619": { lat: 32.7157, lng: -117.1611 }, // San Diego, CA
  "620": { lat: 37.6872, lng: -97.3301 }, // Wichita, KS
  "623": { lat: 33.5387, lng: -112.186 }, // Glendale, AZ
  "626": { lat: 34.1478, lng: -118.1445 }, // Pasadena, CA
  "628": { lat: 37.7749, lng: -122.4194 }, // SF overlay
  "629": { lat: 36.1627, lng: -86.7816 }, // Nashville overlay
  "630": { lat: 41.7606, lng: -88.3201 }, // Aurora, IL
  "631": { lat: 40.7891, lng: -73.135 }, // Suffolk County, NY
  "636": { lat: 38.8106, lng: -90.6998 }, // St Charles, MO
  "641": { lat: 41.0086, lng: -91.9633 }, // Fairfield, IA
  "646": { lat: 40.7128, lng: -74.006 }, // Manhattan overlay
  "650": { lat: 37.4419, lng: -122.143 }, // Palo Alto, CA
  "651": { lat: 44.9537, lng: -93.09 }, // St Paul, MN
  "657": { lat: 33.8366, lng: -117.9143 }, // Anaheim, CA
  "660": { lat: 39.0911, lng: -94.4155 }, // Warrensburg, MO
  "661": { lat: 35.3733, lng: -119.0187 }, // Bakersfield, CA
  "662": { lat: 34.2576, lng: -88.7034 }, // Tupelo, MS
  "667": { lat: 39.2904, lng: -76.6122 }, // Baltimore overlay
  "669": { lat: 37.3382, lng: -121.8863 }, // San Jose overlay
  "678": { lat: 33.749, lng: -84.388 }, // Atlanta overlay
  "681": { lat: 38.3498, lng: -81.6326 }, // Charleston, WV
  "682": { lat: 32.7555, lng: -97.3308 }, // Fort Worth, TX
  "701": { lat: 46.8772, lng: -96.7898 }, // Fargo, ND
  "702": { lat: 36.1699, lng: -115.1398 }, // Las Vegas, NV
  "703": { lat: 38.8048, lng: -77.0469 }, // Alexandria, VA
  "704": { lat: 35.2271, lng: -80.8431 }, // Charlotte, NC
  "706": { lat: 33.4735, lng: -82.0105 }, // Augusta, GA
  "707": { lat: 38.4404, lng: -122.7141 }, // Santa Rosa, CA
  "708": { lat: 41.885, lng: -87.7845 }, // Cicero, IL
  "713": { lat: 29.7604, lng: -95.3698 }, // Houston, TX
  "714": { lat: 33.8366, lng: -117.9143 }, // Anaheim, CA
  "715": { lat: 44.8113, lng: -91.4985 }, // Eau Claire, WI
  "716": { lat: 42.8864, lng: -78.8784 }, // Buffalo, NY
  "717": { lat: 40.2732, lng: -76.8867 }, // Harrisburg, PA
  "718": { lat: 40.6782, lng: -73.9442 }, // Brooklyn, NY
  "719": { lat: 38.8339, lng: -104.8214 }, // Colorado Springs, CO
  "720": { lat: 39.7392, lng: -104.9903 }, // Denver overlay
  "724": { lat: 40.3015, lng: -79.5389 }, // Greensburg, PA
  "725": { lat: 36.1699, lng: -115.1398 }, // Las Vegas overlay
  "727": { lat: 27.7676, lng: -82.6403 }, // St Petersburg, FL
  "731": { lat: 35.6145, lng: -88.8139 }, // Jackson, TN
  "732": { lat: 40.2206, lng: -74.7597 }, // Central NJ
  "734": { lat: 42.2808, lng: -83.743 }, // Ann Arbor, MI
  "737": { lat: 30.2672, lng: -97.7431 }, // Austin overlay
  "740": { lat: 39.3292, lng: -82.1013 }, // Athens, OH
  "747": { lat: 34.1683, lng: -118.6059 }, // San Fernando Valley
  "754": { lat: 26.1224, lng: -80.1373 }, // Fort Lauderdale, FL
  "757": { lat: 36.8508, lng: -76.2859 }, // Norfolk, VA
  "760": { lat: 33.8303, lng: -116.5453 }, // Palm Springs, CA
  "762": { lat: 33.4735, lng: -82.0105 }, // Augusta overlay
  "763": { lat: 45.0105, lng: -93.4555 }, // Plymouth, MN
  "765": { lat: 40.1934, lng: -85.3864 }, // Muncie, IN
  "769": { lat: 32.2988, lng: -90.1848 }, // Jackson overlay
  "770": { lat: 33.749, lng: -84.388 }, // Atlanta suburbs
  "772": { lat: 27.273, lng: -80.3582 }, // Port St Lucie, FL
  "773": { lat: 41.8781, lng: -87.6298 }, // Chicago city
  "774": { lat: 42.2626, lng: -71.8023 }, // Worcester overlay
  "775": { lat: 39.5296, lng: -119.8138 }, // Reno, NV
  "779": { lat: 42.2711, lng: -89.0937 }, // Rockford, IL
  "781": { lat: 42.3876, lng: -71.0995 }, // Somerville, MA
  "785": { lat: 39.0473, lng: -95.6752 }, // Topeka, KS
  "786": { lat: 25.7617, lng: -80.1918 }, // Miami overlay
  "801": { lat: 40.7608, lng: -111.891 }, // Salt Lake City, UT
  "802": { lat: 44.4759, lng: -73.2121 }, // Burlington, VT
  "803": { lat: 34.0007, lng: -81.0348 }, // Columbia, SC
  "804": { lat: 37.5407, lng: -77.436 }, // Richmond, VA
  "805": { lat: 34.4208, lng: -119.6982 }, // Santa Barbara, CA
  "806": { lat: 35.222, lng: -101.8313 }, // Amarillo, TX
  "808": { lat: 21.3069, lng: -157.8583 }, // Honolulu, HI
  "810": { lat: 43.0125, lng: -83.6875 }, // Flint, MI
  "812": { lat: 38.2964, lng: -86.9558 }, // Evansville, IN
  "813": { lat: 27.9506, lng: -82.4572 }, // Tampa, FL
  "814": { lat: 42.1292, lng: -80.0851 }, // Erie, PA
  "815": { lat: 42.2711, lng: -89.0937 }, // Rockford, IL
  "816": { lat: 39.0997, lng: -94.5786 }, // Kansas City, MO
  "817": { lat: 32.7555, lng: -97.3308 }, // Fort Worth, TX
  "818": { lat: 34.1683, lng: -118.6059 }, // San Fernando Valley
  "828": { lat: 35.5951, lng: -82.5515 }, // Asheville, NC
  "830": { lat: 29.703, lng: -98.1245 }, // New Braunfels, TX
  "831": { lat: 36.6002, lng: -121.8947 }, // Monterey, CA
  "832": { lat: 29.7604, lng: -95.3698 }, // Houston overlay
  "843": { lat: 32.7765, lng: -79.9311 }, // Charleston, SC
  "845": { lat: 41.7004, lng: -73.921 }, // Poughkeepsie, NY
  "847": { lat: 42.0451, lng: -87.6877 }, // Evanston, IL
  "848": { lat: 40.2206, lng: -74.7597 }, // Central NJ
  "850": { lat: 30.4383, lng: -84.2807 }, // Tallahassee, FL
  "856": { lat: 39.9259, lng: -75.1196 }, // Camden, NJ
  "857": { lat: 42.3601, lng: -71.0589 }, // Boston overlay
  "858": { lat: 32.7157, lng: -117.1611 }, // San Diego overlay
  "859": { lat: 38.0406, lng: -84.5037 }, // Lexington, KY
  "860": { lat: 41.7658, lng: -72.6734 }, // Hartford, CT
  "862": { lat: 40.7357, lng: -74.1724 }, // Newark overlay
  "863": { lat: 27.8964, lng: -81.8431 }, // Lakeland, FL
  "864": { lat: 34.8526, lng: -82.394 }, // Greenville, SC
  "865": { lat: 35.9606, lng: -83.9207 }, // Knoxville, TN
  "870": { lat: 35.8423, lng: -90.7043 }, // Jonesboro, AR
  "872": { lat: 41.8781, lng: -87.6298 }, // Chicago overlay
  "878": { lat: 40.4406, lng: -79.9959 }, // Pittsburgh overlay
  "901": { lat: 35.1495, lng: -90.049 }, // Memphis, TN
  "903": { lat: 32.3513, lng: -95.3011 }, // Tyler, TX
  "904": { lat: 30.3322, lng: -81.6557 }, // Jacksonville, FL
  "906": { lat: 46.5436, lng: -87.3954 }, // Marquette, MI
  "907": { lat: 61.2181, lng: -149.9003 }, // Anchorage, AK
  "908": { lat: 40.5795, lng: -74.4115 }, // Central NJ
  "909": { lat: 34.1083, lng: -117.2898 }, // San Bernardino, CA
  "910": { lat: 34.2104, lng: -77.8868 }, // Wilmington, NC
  "912": { lat: 32.0809, lng: -81.0912 }, // Savannah, GA
  "913": { lat: 39.1142, lng: -94.6275 }, // Kansas City, KS
  "914": { lat: 40.9312, lng: -73.8988 }, // Westchester, NY
  "915": { lat: 31.7619, lng: -106.485 }, // El Paso, TX
  "916": { lat: 38.5816, lng: -121.4944 }, // Sacramento, CA
  "917": { lat: 40.7128, lng: -74.006 }, // NYC overlay
  "918": { lat: 36.154, lng: -95.9928 }, // Tulsa, OK
  "919": { lat: 35.7796, lng: -78.6382 }, // Raleigh, NC
  "920": { lat: 44.5133, lng: -88.0133 }, // Green Bay, WI
  "925": { lat: 37.9779, lng: -122.0311 }, // Walnut Creek, CA
  "928": { lat: 35.1894, lng: -111.455 }, // Flagstaff, AZ
  "929": { lat: 40.6782, lng: -73.9442 }, // Brooklyn overlay
  "930": { lat: 41.6764, lng: -86.252 }, // South Bend, IN
  "931": { lat: 35.0456, lng: -85.3097 }, // Chattanooga, TN
  "936": { lat: 30.7235, lng: -95.5508 }, // Huntsville, TX
  "937": { lat: 39.7589, lng: -84.1916 }, // Dayton, OH
  "940": { lat: 33.2148, lng: -97.1331 }, // Denton, TX
  "941": { lat: 27.3364, lng: -82.5307 }, // Sarasota, FL
  "947": { lat: 42.5145, lng: -83.0147 }, // Detroit suburbs
  "949": { lat: 33.6846, lng: -117.8265 }, // Irvine, CA
  "951": { lat: 33.9806, lng: -117.3755 }, // Riverside, CA
  "952": { lat: 44.848, lng: -93.2877 }, // Bloomington, MN
  "954": { lat: 26.1224, lng: -80.1373 }, // Fort Lauderdale
  "956": { lat: 26.2034, lng: -98.23 }, // McAllen, TX
  "959": { lat: 41.7658, lng: -72.6734 }, // Hartford overlay
  "970": { lat: 40.5853, lng: -105.0844 }, // Fort Collins, CO
  "971": { lat: 45.5152, lng: -122.6784 }, // Portland overlay
  "972": { lat: 32.7767, lng: -96.797 }, // Dallas overlay
  "973": { lat: 40.7357, lng: -74.1724 }, // Newark overlay
  "978": { lat: 42.6334, lng: -71.3162 }, // Lowell, MA
  "979": { lat: 30.628, lng: -96.3344 }, // College Station, TX
  "980": { lat: 35.2271, lng: -80.8431 }, // Charlotte overlay
  "984": { lat: 35.7796, lng: -78.6382 }, // Raleigh overlay
  "985": { lat: 30.5044, lng: -90.4612 }, // Hammond, LA
  "989": { lat: 43.6156, lng: -84.2472 }, // Saginaw, MI
};

function normalizePhoneDigits(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits;
}

export function getLocationFromPhone(phoneNumber: string | null | undefined): GeoPoint | null {
  const raw = (phoneNumber ?? "").trim();
  if (!raw) return null;
  const digits = normalizePhoneDigits(raw);
  if (digits.length < 10) return null;
  const areaCode = digits.slice(0, 3);
  return AREA_CODE_TO_COORDS[areaCode] ?? null;
}
