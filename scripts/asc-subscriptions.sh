#!/bin/bash
# Creates Tenfold's App Store subscriptions through Superwall's App Store Connect proxy.
# Run from a normal Terminal (the Superwall CLI must be logged in: `npx -y superwall whoami`):
#   bash scripts/asc-subscriptions.sh
# Safe to re-run: existing objects are found and reused.
set -euo pipefail

APP_ID="6816729918"                     # TenFold Editor in App Store Connect
GROUP_NAME="Tenfold"
SW="npx -y superwall"

# Tiny JSON query helper. The expression it evaluates is a literal written in this script (below),
# never input from outside, so `eval` here only runs our own selectors against the parsed response.
json() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(eval(process.argv[1]))})" "$1"; }

echo "== Subscription group"
GID=$($SW asc "/v1/apps/$APP_ID/subscriptionGroups?fields[subscriptionGroups]=referenceName" --json | json "(j.data.find(g=>g.attributes.referenceName==='$GROUP_NAME')||{}).id||''")
if [ -z "$GID" ]; then
  GID=$($SW asc post /v1/subscriptionGroups -d referenceName="$GROUP_NAME" -d app="$APP_ID" --json | json "j.data.id")
  $SW asc post /v1/subscriptionGroupLocalizations -d name="$GROUP_NAME" -d locale=en-US -d subscriptionGroup="$GID" --json > /dev/null
fi
echo "group $GID"

# name | productId | period | groupLevel | price | tier description
SUBS=(
  "Starter Monthly|com.ibrahim.tenfold.starter.monthly|ONE_MONTH|3|19.99|Batches of 20, 100 exports a month, every caption style, no watermark."
  "Starter Yearly|com.ibrahim.tenfold.starter.yearly|ONE_YEAR|3|159.99|Batches of 20, 100 exports a month, every caption style, no watermark."
  "Pro Monthly|com.ibrahim.tenfold.pro.monthly|ONE_MONTH|2|49.99|Batches of 50, 300 exports a month, every caption style, no watermark, 4K export."
  "Pro Yearly|com.ibrahim.tenfold.pro.yearly|ONE_YEAR|2|399.99|Batches of 50, 300 exports a month, every caption style, no watermark, 4K export."
  "Studio Monthly|com.ibrahim.tenfold.studio.monthly|ONE_MONTH|1|89.99|Batches of 100, unlimited exports, every caption style, no watermark, 4K export."
  "Studio Yearly|com.ibrahim.tenfold.studio.yearly|ONE_YEAR|1|719.99|Batches of 100, unlimited exports, every caption style, no watermark, 4K export."
)

TERRITORIES=$($SW asc "/v1/territories?limit=200" --json | json "j.data.map(t=>t.id).join(',')")

for row in "${SUBS[@]}"; do
  IFS='|' read -r NAME PID PERIOD LEVEL PRICE DESC <<< "$row"
  echo "== $NAME ($PID)"
  SID=$($SW asc "/v1/subscriptionGroups/$GID/subscriptions?fields[subscriptions]=productId&limit=50" --json | json "(j.data.find(s=>s.attributes.productId==='$PID')||{}).id||''")
  if [ -z "$SID" ]; then
    SID=$($SW asc post /v1/subscriptions -d name="$NAME" -d productId="$PID" -d subscriptionPeriod="$PERIOD" -d group="$GID" -d groupLevel="$LEVEL" -d familySharable=false -d reviewNote="Unlocks the Tenfold $NAME tier: $DESC" --json | json "j.data.id")
    echo "   created $SID"
  else
    echo "   exists $SID"
  fi

  # Localised name and description (en-US)
  HAS_LOC=$($SW asc "/v1/subscriptions/$SID/subscriptionLocalizations" --json | json "j.data.length")
  if [ "$HAS_LOC" = "0" ]; then
    $SW asc post /v1/subscriptionLocalizations -d name="Tenfold ${NAME% *}" -d locale=en-US -d description="$DESC" -d subscription="$SID" --json > /dev/null
    echo "   localisation added"
  fi

  # Price: find the USA price point at the wanted customer price, then apply it worldwide (Apple equalises other territories)
  PP=$($SW asc "/v1/subscriptions/$SID/pricePoints?filter[territory]=USA&limit=8000&fields[subscriptionPricePoints]=customerPrice" --json | json "(j.data.find(p=>p.attributes.customerPrice==='$PRICE')||{}).id||''")
  if [ -z "$PP" ]; then echo "   !! no USA price point for $PRICE"; exit 1; fi
  HAS_PRICE=$($SW asc "/v1/subscriptions/$SID/prices?limit=1" --json | json "j.data.length")
  if [ "$HAS_PRICE" = "0" ]; then
    $SW asc post /v1/subscriptionPrices -d subscription="$SID" -d subscriptionPricePoint="$PP" --json > /dev/null
    echo "   price $PRICE set"
  fi

  # 3-day free trial for new subscribers, all territories
  HAS_OFFER=$($SW asc "/v1/subscriptions/$SID/introductoryOffers?limit=1" --json | json "j.data.length")
  if [ "$HAS_OFFER" = "0" ]; then
    $SW asc post /v1/subscriptionIntroductoryOffers -d duration=THREE_DAYS -d offerMode=FREE_TRIAL -d numberOfPeriods=1 -d subscription="$SID" --json > /dev/null
    echo "   3-day free trial added"
  fi

  # Availability: every current territory plus new ones
  HAS_AVAIL=$($SW asc "/v1/subscriptions/$SID/subscriptionAvailability" --json 2>/dev/null | json "j.data?1:0" || echo 0)
  if [ "$HAS_AVAIL" = "0" ]; then
    $SW asc post /v1/subscriptionAvailabilities -d availableInNewTerritories=true -d subscription="$SID" -d availableTerritories="$TERRITORIES" --json > /dev/null
    echo "   available in all territories"
  fi
done

echo
echo "Done. Review each subscription once in App Store Connect (Monetization → Subscriptions) and add a review screenshot if Apple asks for one."
