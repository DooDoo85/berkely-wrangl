import { useState, useMemo } from 'react'

// ═══════════════════════════════════════════════════════════════════════
// FedEx rate estimator — empirical, from ~1,670 of your own shipments
// (origin Anna TX 75409). Enter a destination ZIP to resolve the zone, or
// pick a zone directly. NOT FedEx's official rate table: it returns the
// charge band of similar past packages. A likely range, not a quote.
//
// Billable weight = max(actual, dimensional). Ground dim divisor 139.
// Zone 8 has NO history in your data — it is extrapolated and flagged.
// ═══════════════════════════════════════════════════════════════════════

const MODEL = {"grid": {"2": {"(0, 2]": {"lo": 17.85, "med": 18.34, "hi": 23.36, "nn": 17}, "(2, 5]": {"lo": 17.94, "med": 21.56, "hi": 22.15, "nn": 10}, "(5, 10]": {"lo": 21.25, "med": 22.15, "hi": 22.86, "nn": 20}, "(10, 15]": {"lo": 22.15, "med": 22.19, "hi": 38.45, "nn": 26}, "(15, 20]": {"lo": 22.15, "med": 25.95, "hi": 32.12, "nn": 10}, "(20, 30]": {"lo": 22.15, "med": 30.41, "hi": 30.66, "nn": 13}, "(30, 40]": {"lo": 34.48, "med": 40.81, "hi": 48.78, "nn": 55}, "(40, 50]": {"lo": 40.4, "med": 40.88, "hi": 40.88, "nn": 6}}, "3": {"(0, 2]": {"lo": 13.92, "med": 17.92, "hi": 22.35, "nn": 15}, "(2, 5]": {"lo": 13.82, "med": 18.76, "hi": 22.1, "nn": 22}, "(5, 10]": {"lo": 13.79, "med": 17.27, "hi": 21.96, "nn": 28}, "(10, 15]": {"lo": 13.84, "med": 21.94, "hi": 31.3, "nn": 39}, "(15, 20]": {"lo": 20.41, "med": 22.06, "hi": 30.5, "nn": 15}, "(20, 30]": {"lo": 21.41, "med": 22.1, "hi": 28.75, "nn": 50}, "(30, 40]": {"lo": 35.99, "med": 36.64, "hi": 44.7, "nn": 105}, "(40, 50]": {"lo": 37.97, "med": 42.2, "hi": 45.82, "nn": 21}}, "4": {"(0, 2]": {"lo": 17.63, "med": 21.33, "hi": 27.3, "nn": 7}, "(2, 5]": {"lo": 13.78, "med": 13.96, "hi": 21.94, "nn": 8}, "(5, 10]": {"lo": 13.92, "med": 21.95, "hi": 30.41, "nn": 28}, "(10, 15]": {"lo": 13.9, "med": 21.84, "hi": 28.7, "nn": 41}, "(15, 20]": {"lo": 13.9, "med": 21.84, "hi": 22.15, "nn": 21}, "(20, 30]": {"lo": 20.37, "med": 22.13, "hi": 22.7, "nn": 24}, "(30, 40]": {"lo": 38.34, "med": 43.23, "hi": 53.68, "nn": 91}, "(40, 50]": {"lo": 39.47, "med": 41.7, "hi": 45.39, "nn": 17}}, "5": {"(0, 2]": {"lo": 13.99, "med": 22.06, "hi": 30.41, "nn": 13}, "(2, 5]": {"lo": 13.99, "med": 21.84, "hi": 22.19, "nn": 25}, "(5, 10]": {"lo": 16.53, "med": 22.06, "hi": 30.08, "nn": 56}, "(10, 15]": {"lo": 21.81, "med": 22.06, "hi": 32.11, "nn": 26}, "(15, 20]": {"lo": 22.2, "med": 22.87, "hi": 31.22, "nn": 29}, "(20, 30]": {"lo": 23.11, "med": 24.8, "hi": 32.82, "nn": 82}, "(30, 40]": {"lo": 51.14, "med": 53.81, "hi": 54.36, "nn": 246}, "(40, 50]": {"lo": 54.15, "med": 56.36, "hi": 57.99, "nn": 45}, "(50, 75]": {"lo": 67.81, "med": 68.22, "hi": 68.22, "nn": 3}}, "6": {"(0, 2]": {"lo": 21.17, "med": 21.25, "hi": 22.24, "nn": 5}, "(2, 5]": {"lo": 22.06, "med": 22.24, "hi": 30.41, "nn": 13}, "(5, 10]": {"lo": 22.06, "med": 22.08, "hi": 28.08, "nn": 42}, "(10, 15]": {"lo": 21.33, "med": 22.06, "hi": 22.29, "nn": 33}, "(15, 20]": {"lo": 23.7, "med": 24.16, "hi": 27.19, "nn": 20}, "(20, 30]": {"lo": 24.74, "med": 28.05, "hi": 30.94, "nn": 50}, "(30, 40]": {"lo": 51.31, "med": 59.47, "hi": 59.82, "nn": 116}, "(40, 50]": {"lo": 54.58, "med": 59.11, "hi": 64.14, "nn": 24}, "(50, 75]": {"lo": 65.41, "med": 65.47, "hi": 66.85, "nn": 3}}, "7": {"(0, 2]": {"lo": 20.75, "med": 21.8, "hi": 24.74, "nn": 4}, "(2, 5]": {"lo": 13.93, "med": 13.93, "hi": 21.2, "nn": 5}, "(5, 10]": {"lo": 21.99, "med": 22.13, "hi": 22.19, "nn": 12}, "(10, 15]": {"lo": 22.81, "med": 23.39, "hi": 31.16, "nn": 5}, "(15, 20]": {"lo": 28.57, "med": 28.68, "hi": 36.42, "nn": 9}, "(20, 30]": {"lo": 33.86, "med": 38.7, "hi": 41.55, "nn": 16}, "(30, 40]": {"lo": 64.78, "med": 65.91, "hi": 74.34, "nn": 78}, "(40, 50]": {"lo": 66.48, "med": 70.9, "hi": 78.04, "nn": 18}}}, "perlb": {"2": 1.501, "3": 1.118, "4": 1.168, "5": 1.351, "6": 1.488, "7": 1.664, "8": 1.84}, "base": {"2": 18.0, "3": 13.9, "4": 13.9, "5": 21.84, "6": 21.75, "7": 22.09, "8": 25.4}, "edges": [0, 2, 5, 10, 15, 20, 30, 40, 50, 75, 100, 150, 500]}

const ZONE_BY_ZIP3 = {
  // Zone 2 — North Texas / DFW metroplex (750-752, 754-756 core)
  '750':2,'751':2,'752':2,'753':2,'754':2,'755':2,'756':2,
  // Zone 3 — Regional TX / S. Oklahoma (Ft Worth 760-762, Waco 766-767,
  // Tyler/Longview 757-759, Wichita Falls 763, Texarkana 755, OKC/Tulsa 73-74)
  '760':3,'761':3,'762':3,'763':3,'764':3,'757':3,'758':3,'759':3,'766':3,'767':3,
  '730':3,'731':3,'734':3,'735':3,'736':3,'737':3,'740':3,'741':3,'743':3,'744':3,'745':3,'746':3,'747':3,'748':3,'749':3,
  // Zone 4 — Most of TX + LA/AR/NM (Houston 770-772, Austin 786-787,
  // San Antonio 782, Corpus 783-784, Laredo 780, Midland/Odessa 797-799,
  // Amarillo 790-791, Abilene 795-796, El Paso 798-799, LA 700-714, AR 716-729, NM 870-884)
  '770':4,'771':4,'772':4,'773':4,'774':4,'775':4,'776':4,'777':4,'778':4,'779':4,
  '780':4,'781':4,'782':4,'783':4,'784':4,'785':4,'786':4,'787':4,'788':4,'789':4,
  '790':4,'791':4,'792':4,'793':4,'794':4,'795':4,'796':4,'797':4,'798':4,'799':4,'765':4,
  '700':4,'701':4,'703':4,'704':4,'705':4,'706':4,'707':4,'708':4,'710':4,'711':4,'712':4,'713':4,'714':4,
  '716':4,'717':4,'718':4,'719':4,'720':4,'721':4,'722':4,'723':4,'724':4,'725':4,'726':4,'727':4,'728':4,'729':4,
  '870':4,'871':4,'873':4,'874':4,'875':4,'877':4,'878':4,'879':4,'880':4,'881':4,'882':4,'883':4,'884':4,
  // Zone 5 — South Central (KC 640-641, Little Rock 720s already z4, Memphis 380-381,
  // New Orleans 701 already z4, Jackson MS 390-392, Baton Rouge 707 z4, MO 63-65, KS 66-67, MS 386-397)
  '640':5,'641':5,'644':5,'645':5,'646':5,'647':5,'648':5,'649':5,'650':5,'651':5,'652':5,'653':5,'654':5,'655':5,'656':5,'657':5,'658':5,
  '630':5,'631':5,'633':5,'634':5,'635':5,'636':5,'637':5,'638':5,'639':5,
  '660':5,'661':5,'662':5,'664':5,'665':5,'666':5,'667':5,'668':5,'669':5,'670':5,'671':5,'672':5,'673':5,'674':5,'675':5,'676':5,'677':5,'678':5,'679':5,
  '380':5,'381':5,'382':5,'383':5,'384':5,'385':5,'386':5,'387':5,'388':5,'389':5,'390':5,'391':5,'392':5,'393':5,'394':5,'395':5,'396':5,'397':5,
  // Zone 6 — Midwest & Southeast (Chicago 606, Indy 462, Nashville 372,
  // Birmingham 352, Atlanta 303, Minneapolis 554, Denver 802, IL/IN/TN/AL/GA/MN/CO/IA/WI/KY)
  '600':6,'601':6,'602':6,'603':6,'604':6,'605':6,'606':6,'607':6,'608':6,'609':6,'610':6,'611':6,'612':6,'613':6,'614':6,'615':6,'616':6,'617':6,'618':6,'619':6,'620':6,'622':6,'623':6,'624':6,'625':6,'626':6,'627':6,'628':6,'629':6,
  '460':6,'461':6,'462':6,'463':6,'464':6,'465':6,'466':6,'467':6,'468':6,'469':6,'470':6,'471':6,'472':6,'473':6,'474':6,'475':6,'476':6,'477':6,'478':6,'479':6,
  '370':6,'371':6,'372':6,'373':6,'374':6,'376':6,'377':6,'378':6,'379':6,
  '350':6,'351':6,'352':6,'354':6,'355':6,'356':6,'357':6,'358':6,'359':6,'360':6,'361':6,'362':6,'363':6,'364':6,'365':6,'366':6,'367':6,'368':6,'369':6,
  '300':6,'301':6,'302':6,'303':6,'304':6,'305':6,'306':6,'307':6,'308':6,'309':6,'310':6,'311':6,'312':6,'313':6,'314':6,'315':6,'316':6,'317':6,'318':6,'319':6,'398':6,'399':6,
  '550':6,'551':6,'553':6,'554':6,'556':6,'557':6,'558':6,'559':6,'560':6,'561':6,'562':6,'563':6,'564':6,'565':6,'566':6,'567':6,
  '800':6,'801':6,'802':6,'803':6,'804':6,'805':6,'806':6,'807':6,'808':6,'809':6,'810':6,'811':6,'812':6,'813':6,'814':6,'815':6,'816':6,
  '500':6,'501':6,'502':6,'503':6,'504':6,'505':6,'506':6,'507':6,'508':6,'509':6,'510':6,'511':6,'512':6,'513':6,'514':6,'515':6,'516':6,
  '530':6,'531':6,'532':6,'534':6,'535':6,'537':6,'538':6,'539':6,'540':6,'541':6,'542':6,'543':6,'544':6,'545':6,'546':6,'547':6,'548':6,'549':6,
  '400':6,'401':6,'402':6,'403':6,'404':6,'405':6,'406':6,'407':6,'408':6,'409':6,'410':6,'411':6,'412':6,'413':6,'414':6,'415':6,'416':6,'417':6,'418':6,'420':6,'421':6,'422':6,'423':6,'424':6,'425':6,'426':6,'427':6,
  // Zone 7 — East Coast & Mountain West (Detroit 482, Cleveland 441,
  // Pittsburgh 152, Charlotte 282, Raleigh 276, DC 200, Philly 191, SLC 841, OH/MI/PA/NC/VA/MD/UT/WY/ID/MT/ND/SD/NE)
  '480':7,'481':7,'482':7,'483':7,'484':7,'485':7,'486':7,'487':7,'488':7,'489':7,'490':7,'491':7,'492':7,'493':7,'494':7,'495':7,'496':7,'497':7,'498':7,'499':7,
  '430':7,'431':7,'432':7,'433':7,'434':7,'435':7,'436':7,'437':7,'438':7,'439':7,'440':7,'441':7,'442':7,'443':7,'444':7,'445':7,'446':7,'447':7,'448':7,'449':7,'450':7,'451':7,'452':7,'453':7,'454':7,'455':7,'456':7,'457':7,'458':7,
  '150':7,'151':7,'152':7,'153':7,'154':7,'155':7,'156':7,'157':7,'158':7,'159':7,'160':7,'161':7,'162':7,'163':7,'164':7,'165':7,'166':7,'167':7,'168':7,'169':7,'170':7,'171':7,'172':7,'173':7,'174':7,'175':7,'176':7,'177':7,'178':7,'179':7,'180':7,'181':7,'182':7,'183':7,'184':7,'185':7,'186':7,'187':7,'188':7,'189':7,'190':7,'191':7,'192':7,'193':7,'194':7,'195':7,'196':7,
  '270':7,'271':7,'272':7,'273':7,'274':7,'275':7,'276':7,'277':7,'278':7,'279':7,'280':7,'281':7,'282':7,'283':7,'284':7,'285':7,'286':7,'287':7,'288':7,'289':7,
  '220':7,'221':7,'222':7,'223':7,'224':7,'225':7,'226':7,'227':7,'228':7,'229':7,'230':7,'231':7,'232':7,'233':7,'234':7,'235':7,'236':7,'237':7,'238':7,'239':7,'240':7,'241':7,'242':7,'243':7,'244':7,'245':7,'246':7,
  '200':7,'201':7,'202':7,'203':7,'204':7,'205':7,'206':7,'207':7,'208':7,'209':7,'210':7,'211':7,'212':7,'214':7,'215':7,'216':7,'217':7,'218':7,'219':7,
  '840':7,'841':7,'842':7,'843':7,'844':7,'845':7,'846':7,'847':7,
  '820':7,'821':7,'822':7,'823':7,'824':7,'825':7,'826':7,'827':7,'828':7,'829':7,'830':7,'831':7,
  '832':7,'833':7,'834':7,'835':7,'836':7,'837':7,'838':7,
  '590':7,'591':7,'592':7,'593':7,'594':7,'595':7,'596':7,'597':7,'598':7,'599':7,
  '580':7,'581':7,'582':7,'583':7,'584':7,'585':7,'586':7,'587':7,'588':7,
  '680':7,'681':7,'683':7,'684':7,'685':7,'686':7,'687':7,'688':7,'689':7,'690':7,'691':7,'692':7,'693':7,
  // Zone 8 — West Coast & Northeast (LA 900s, SF 940s, Seattle 980s, Portland 970s,
  // NYC 100s, Boston 021, Hartford 061, Providence 028) — EXTRAPOLATED
  '900':8,'901':8,'902':8,'903':8,'904':8,'905':8,'906':8,'907':8,'908':8,'910':8,'911':8,'912':8,'913':8,'914':8,'915':8,'916':8,'917':8,'918':8,'919':8,'920':8,'921':8,'922':8,'923':8,'924':8,'925':8,'926':8,'927':8,'928':8,'930':8,'931':8,'932':8,'933':8,'934':8,'935':8,'936':8,'937':8,'938':8,'939':8,'940':8,'941':8,'942':8,'943':8,'944':8,'945':8,'946':8,'947':8,'948':8,'949':8,'950':8,'951':8,'952':8,'953':8,'954':8,'955':8,'956':8,'957':8,'958':8,'959':8,'960':8,'961':8,
  '970':8,'971':8,'972':8,'973':8,'974':8,'975':8,'976':8,'977':8,'978':8,'979':8,'980':8,'981':8,'982':8,'983':8,'984':8,'985':8,'986':8,'988':8,'989':8,'990':8,'991':8,'992':8,'993':8,'994':8,
  '100':8,'101':8,'102':8,'103':8,'104':8,'105':8,'106':8,'107':8,'108':8,'109':8,'110':8,'111':8,'112':8,'113':8,'114':8,'115':8,'116':8,'117':8,'118':8,'119':8,'120':8,'121':8,'122':8,'123':8,'124':8,'125':8,'126':8,'127':8,'128':8,'129':8,'130':8,'131':8,'132':8,'133':8,'134':8,'135':8,'136':8,'137':8,'138':8,'139':8,'140':8,'141':8,'142':8,'143':8,'144':8,'145':8,'146':8,'147':8,'148':8,'149':8,
  '010':8,'011':8,'012':8,'013':8,'014':8,'015':8,'016':8,'017':8,'018':8,'019':8,'020':8,'021':8,'022':8,'023':8,'024':8,'025':8,'026':8,'027':8,'028':8,'029':8,'030':8,'031':8,'032':8,'033':8,'034':8,'035':8,'036':8,'037':8,'038':8,'039':8,'040':8,'041':8,'042':8,'043':8,'044':8,'045':8,'046':8,'047':8,'048':8,'049':8,'050':8,'051':8,'052':8,'053':8,'054':8,'055':8,'056':8,'057':8,'058':8,'059':8,'060':8,'061':8,'062':8,'063':8,'064':8,'065':8,'066':8,'067':8,'068':8,'069':8,'070':8,'071':8,'072':8,'073':8,'074':8,'075':8,'076':8,'077':8,'078':8,'079':8,'080':8,'081':8,'082':8,'083':8,'084':8,'085':8,'086':8,'087':8,'088':8,'089':8,
}

function zoneFromZip(zip) {
  const z3 = String(zip || '').replace(/\D/g, '').slice(0, 3)
  if (z3.length < 3) return null
  return ZONE_BY_ZIP3[z3] || null
}

function bucketLabel(w, edges) {
  for (let i = 0; i < edges.length - 1; i++) {
    if (w > edges[i] && w <= edges[i + 1]) return `(${edges[i]}, ${edges[i + 1]}]`
  }
  return null
}

export default function FreightRateCalc() {
  const [L, setL] = useState('')
  const [W, setW] = useState('')
  const [H, setH] = useState('')
  const [wt, setWt] = useState('')
  const [zip, setZip] = useState('')
  const [zoneOverride, setZoneOverride] = useState(null)

  const zipZone = zoneFromZip(zip)
  const zone = zoneOverride || (zipZone ? String(zipZone) : '4')

  const est = useMemo(() => {
    const l = parseFloat(L), w = parseFloat(W), h = parseFloat(H), aw = parseFloat(wt)
    if (!aw && !(l && w && h)) return null
    const dimwt = (l && w && h) ? (l * w * h) / 139 : 0
    const billwt = Math.max(aw || 0, dimwt)
    if (!billwt) return null
    const extrapolated = zone === '8'
    const lbl = bucketLabel(billwt, MODEL.edges)
    const cell = lbl && MODEL.grid[zone] ? MODEL.grid[zone][lbl] : null
    if (cell) {
      return { billwt, dimwt, dimDriven: dimwt > (aw || 0), med: cell.med, lo: cell.lo, hi: cell.hi, n: cell.nn, extrapolated }
    }
    const perlb = MODEL.perlb[zone] || 1.5
    const base = MODEL.base[zone] || 16
    const e = Math.max(base, billwt * perlb)
    return { billwt, dimwt, dimDriven: dimwt > (aw || 0), med: e, lo: e * 0.8, hi: e * 1.25, n: 0, extrapolated, perlbBasis: true }
  }, [L, W, H, wt, zone])

  const usd = (x) => `$${Number(x).toFixed(2)}`

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1>FedEx Rate Estimator</h1>
        <p className="text-sm text-ink-muted mt-1">
          Likely charge for a package shipping from Anna, TX. Learned from your shipment history — an estimate range, not an official quote.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="card p-5 space-y-4">
          <div>
            <label className="block text-xs text-ink-muted uppercase tracking-wider mb-1.5">Dimensions (inches)</label>
            <div className="flex gap-2 items-center">
              <input type="number" placeholder="L" value={L} onChange={e => setL(e.target.value)} className="w-full border border-surface-border rounded-lg px-3 py-2 text-sm" />
              <span className="text-ink-muted">×</span>
              <input type="number" placeholder="W" value={W} onChange={e => setW(e.target.value)} className="w-full border border-surface-border rounded-lg px-3 py-2 text-sm" />
              <span className="text-ink-muted">×</span>
              <input type="number" placeholder="H" value={H} onChange={e => setH(e.target.value)} className="w-full border border-surface-border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-ink-muted uppercase tracking-wider mb-1.5">Actual weight (lb)</label>
            <input type="number" placeholder="lb" value={wt} onChange={e => setWt(e.target.value)} className="w-full border border-surface-border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-ink-muted uppercase tracking-wider mb-1.5">Destination ZIP</label>
            <div className="flex gap-2 items-center">
              <input placeholder="e.g. 77002" value={zip} maxLength={5}
                onChange={e => { setZip(e.target.value); setZoneOverride(null) }}
                className="w-32 border border-surface-border rounded-lg px-3 py-2 text-sm" />
              {zipZone && !zoneOverride && <span className="text-xs text-status-healthy">→ Zone {zipZone}</span>}
              {zip.replace(/\D/g,'').length >= 3 && !zipZone && <span className="text-xs text-ink-muted">zone not mapped — pick below</span>}
            </div>
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {['2','3','4','5','6','7','8'].map(z => (
                <button key={z} onClick={() => setZoneOverride(z)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors ${
                    zone === z ? 'bg-accent-clay text-ink-inverse border-accent-clay'
                               : 'bg-surface-card text-ink-mid border-surface-border hover:border-ink-muted'}`}>
                  Z{z}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="card p-5 flex flex-col justify-center">
          {est ? (
            <>
              <p className="text-[10px] text-ink-muted uppercase tracking-wider mb-1">Estimated charge · Zone {zone}</p>
              <p className="text-4xl font-semibold text-ink-strong tabular-nums">{usd(est.med)}</p>
              <p className="text-sm text-ink-mid mt-1">likely {usd(est.lo)} – {usd(est.hi)}</p>
              <div className="mt-4 pt-4 border-t border-surface-border space-y-1.5 text-xs text-ink-mid">
                <div className="flex justify-between"><span>Billable weight</span><span className="tabular-nums font-medium">{est.billwt.toFixed(1)} lb</span></div>
                {est.dimwt > 0 && (
                  <div className="flex justify-between">
                    <span>Dimensional weight</span>
                    <span className={`tabular-nums ${est.dimDriven ? 'text-status-critical font-semibold' : ''}`}>{est.dimwt.toFixed(1)} lb</span>
                  </div>
                )}
                {est.dimDriven && <p className="text-[11px] text-status-critical pt-1">⚠ Dim weight exceeds actual — billed for size, not contents. A smaller carton would cost less.</p>}
                <div className="flex justify-between pt-1">
                  <span>Based on</span>
                  <span>{est.n > 0 ? `${est.n} similar shipments` : 'per-lb estimate'}</span>
                </div>
                {est.extrapolated && <p className="text-[11px] text-amber-700 pt-1">⚠ Zone 8 has no history in your data — this is extrapolated from the Zone 6→7 trend and less reliable.</p>}
              </div>
            </>
          ) : (
            <div className="text-center text-ink-muted text-sm py-8">Enter dimensions and/or weight to estimate.</div>
          )}
        </div>
      </div>

      <p className="text-[11px] text-ink-muted mt-4">
        Zones are distance bands from Anna, TX (75409), resolved by destination ZIP. Estimates reflect your negotiated
        rates and typical surcharges as seen in past bills, but actual charges vary with fuel, residential, and
        accessorial fees. Zones 2–7 are learned from history; Zone 8 is extrapolated. Use as a sanity check, not a binding quote.
      </p>
    </div>
  )
}
