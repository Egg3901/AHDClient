const eisenhowerInauguration = new URL("../assets/eras/1953-eisenhower-inauguration.gif", import.meta.url).href;
const jimmyCarter = new URL("../assets/eras/1979-jimmy-carter.jpg", import.meta.url).href;
const bushPredecessors = new URL("../assets/eras/1991-bush-predecessors.jpg", import.meta.url).href;
const billClinton = new URL("../assets/eras/1999-bill-clinton.jpg", import.meta.url).href;
const bushFord = new URL("../assets/eras/2007-bush-ford.jpg", import.meta.url).href;
const trumpImranKhan = new URL("../assets/eras/2019-trump-imran-khan.jpg", import.meta.url).href;
const bidenOvalOffice = new URL("../assets/eras/2023-biden-oval-office.jpg", import.meta.url).href;

export type EraPhoto = {
  src: string;
  alt: string;
  credit: string;
  license: string;
  sourceUrl: string;
};

export const ERA_PHOTOS: Record<string, EraPhoto> = {
  "1953": {
    src: eisenhowerInauguration,
    alt: "Dwight D. Eisenhower's 1953 presidential inauguration at the U.S. Capitol",
    credit: "Abbie Rowe, National Park Service, via National Archives",
    license: "Public domain, U.S. federal government work",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Eisenhower_inauguration.gif",
  },
  "1979": {
    src: jimmyCarter,
    alt: "Portrait of President Jimmy Carter in 1979",
    credit: "Ansel Adams, Smithsonian National Portrait Gallery",
    license: "CC0 1.0 Universal Public Domain Dedication",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:Portrait_of_Jimmy_Carter_by_Ansel_Adams_(1979)_(cropped).jpg",
  },
  "1991": {
    src: bushPredecessors,
    alt: "President George H. W. Bush with four former presidents in 1991",
    credit: "White House photo",
    license: "Public domain, U.S. federal government work",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:President_George_H._W._Bush_poses_for_a_photograph_with_four_of_his_predecessors.jpg",
  },
  "1999": {
    src: billClinton,
    alt: "Portrait of President Bill Clinton in the Cabinet Room in 1999",
    credit: "White House Photograph Office, Clinton Administration, via National Archives",
    license: "Public domain, U.S. federal government work",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:Bill_Clinton_1999.jpg",
  },
  "2007": {
    src: bushFord,
    alt: "President George W. Bush touring a Ford assembly plant in 2007",
    credit: "Eric Draper, White House",
    license: "Public domain, U.S. federal government work",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:George_Bush_visit_Kansas_City_Assembly.jpg",
  },
  "2019": {
    src: trumpImranKhan,
    alt: "President Donald Trump meeting Prime Minister Imran Khan in 2019",
    credit: "Andrea Hanks, White House",
    license: "Public domain, U.S. federal government work",
    sourceUrl:
      "https://commons.wikimedia.org/wiki/File:President_Trump_Meets_with_the_Prime_Minister_of_Pakistan_(48350243921).jpg",
  },
  "2023": {
    src: bidenOvalOffice,
    alt: "President Joe Biden conferring in the Oval Office in 2023",
    credit: "Adam Schultz, White House",
    license: "Public domain, U.S. federal government work",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:P20230106AS-0338_(52644827761).jpg",
  },
  "2027": {
    src: bidenOvalOffice,
    alt: "The Oval Office, representing the incoming 2027 political era",
    credit: "Adam Schultz, White House",
    license: "Public domain, U.S. federal government work",
    sourceUrl: "https://commons.wikimedia.org/wiki/File:P20230106AS-0338_(52644827761).jpg",
  },
};

/** Source and rights record for the bundled assets. Keep this next to the map for review. */
export const ERA_PHOTO_LICENSE_MANIFEST = {
  "1953": {
    sourceUrl: ERA_PHOTOS["1953"]!.sourceUrl,
    originalSourceUrl: "https://catalog.archives.gov/id/200417",
    license: ERA_PHOTOS["1953"]!.license,
  },
  "1979": {
    sourceUrl: ERA_PHOTOS["1979"]!.sourceUrl,
    license: ERA_PHOTOS["1979"]!.license,
  },
  "1991": {
    sourceUrl: ERA_PHOTOS["1991"]!.sourceUrl,
    originalSourceUrl: "https://www.pbs.org/newshour/nation/history-presidential-visits-pope",
    license: ERA_PHOTOS["1991"]!.license,
  },
  "1999": {
    sourceUrl: ERA_PHOTOS["1999"]!.sourceUrl,
    originalSourceUrl: "https://catalog.archives.gov/id/183374072",
    license: ERA_PHOTOS["1999"]!.license,
  },
  "2007": {
    sourceUrl: ERA_PHOTOS["2007"]!.sourceUrl,
    originalSourceUrl: "https://georgewbush-whitehouse.archives.gov/news/releases/2007/03/20070320-7.html",
    license: ERA_PHOTOS["2007"]!.license,
  },
  "2019": {
    sourceUrl: ERA_PHOTOS["2019"]!.sourceUrl,
    originalSourceUrl: "https://flickr.com/photos/148748355@N05/48350243921",
    license: ERA_PHOTOS["2019"]!.license,
  },
  "2023": {
    sourceUrl: ERA_PHOTOS["2023"]!.sourceUrl,
    originalSourceUrl: "https://flickr.com/photos/191819781@N02/52644827761",
    license: ERA_PHOTOS["2023"]!.license,
  },
  "2027": {
    sourceUrl: ERA_PHOTOS["2027"]!.sourceUrl,
    originalSourceUrl: "https://flickr.com/photos/191819781@N02/52644827761",
    license: ERA_PHOTOS["2027"]!.license,
  },
} as const;
