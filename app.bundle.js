(function () {
    'use strict';
    console.log('MFES bundle loaded ✅', new Date().toISOString());

    /* =====================================================
       MAP
    ===================================================== */
    const map = L.map('map', { preferCanvas: true }).setView([43.59, -79.64], 11);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    window.map = map;

    // Panes
    map.createPane('pointsPane');
    map.getPane('pointsPane').style.zIndex = 640;
    map.getPane('pointsPane').style.pointerEvents = 'auto';

    map.createPane('labelsPane');
    map.getPane('labelsPane').style.zIndex = 645;
    map.getPane('labelsPane').style.pointerEvents = 'none';

    /* =====================================================
       HELPERS
    ===================================================== */
    function getPropCI(obj, ...cands) {
        if (!obj) return undefined;
        const lower = Object.create(null);
        for (const k of Object.keys(obj)) lower[k.toLowerCase()] = k;
        for (const c of cands) {
            const real = lower[String(c).toLowerCase()];
            if (real !== undefined) return obj[real];
        }
        return undefined;
    }
    const ci = getPropCI;

    function toNum(v) {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }

    async function fetchJson(url) {
        const res = await fetch(url + (url.includes('?') ? '&' : '?') + 'cb=' + Date.now(), { cache: 'no-store' });
        const txt = await res.text();
        if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}\n${txt.slice(0, 200)}`);
        const clean = txt.charCodeAt(0) === 0xFEFF ? txt.slice(1) : txt;
        return JSON.parse(clean);
    }

    function ensurePointsOnTop() {
        const mp = map.getPanes().mapPane;
        const pp = map.getPane('pointsPane');
        const lp = map.getPane('labelsPane');

        if (pp && mp && pp.parentNode === mp) mp.appendChild(pp);
        if (lp && mp && lp.parentNode === mp) mp.appendChild(lp);

        const pts = overlays[NAME_POINTS];
        if (pts && map.hasLayer(pts)) {
            pts.eachLayer(l => {
                if (l.bringToFront) l.bringToFront();
            });
        }
    }
    function ensureOverallRtChartContainer() {
        return document.getElementById('rt-chart-container');
    }
    function ensureStationRtChartContainer() {
        return document.getElementById('station-rt-chart-container');
    }

    /* =====================================================
       STATIONS
    ===================================================== */
    const STATION_IDS = [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 114, 115, 116, 117, 118, 119, 120, 121, 122];

    const PALETTE = [
        '#8dd3c7', '#ffffb3', '#bebada', '#fb8072', '#80b1d3',
        '#fdb462', '#b3de69', '#fccde5', '#d9d9d9', '#bc80bd',
        '#ccebc5', '#ffed6f', '#1b9e77', '#d95f02', '#7570b3',
        '#e7298a', '#66a61e', '#e6ab02', '#a6761d', '#666666', '#7fc97f'
    ];

    const COLOR = Object.fromEntries(STATION_IDS.map((id, i) => [String(id), PALETTE[i % PALETTE.length]]));

    const STATION_META = {
        101: { neighbourhood: "Cooksville", name: "Station 101", address: "15 Fairview Road West", buildYears: "1974" },
        102: { neighbourhood: "Lakeview", name: "Station 102", address: "710 3rd Street", buildYears: "1978-79" },
        103: { neighbourhood: "Clarkson", name: "Station 103", address: "2035 Lushes Avenue", buildYears: "1984-85" },
        104: { neighbourhood: "Port Credit", name: "Station 104", address: "62 Port Street West", buildYears: "1955" },
        105: { neighbourhood: "Malton", name: "Station 105", address: "7101 Goreway Drive", buildYears: "1981" },
        106: { neighbourhood: "Applewood", name: "Station 106", address: "1355 Winding Trail", buildYears: "2011-13" },
        107: { neighbourhood: "Erindale", name: "Station 107", address: "1965 Dundas Street West", buildYears: "1968-70" },
        108: { neighbourhood: "Streetsville", name: "Station 108", address: "2267 Britannia Road West", buildYears: "1979-80" },
        109: { neighbourhood: "Britannia", name: "Station 109", address: "1735 Britannia Road East", buildYears: "1977" },
        110: { neighbourhood: "Queensway (Cooksville)", name: "Station 110", address: "2316 Hurontario Street", buildYears: "1981-82" },
        111: { neighbourhood: "Meadowvale", name: "Station 111", address: "2740 Derry Road West", buildYears: "1982-83" },
        112: { neighbourhood: "Creditview (Erindale)", name: "Station 112", address: "4090 Creditview Road", buildYears: "1984" },
        114: { neighbourhood: "Heartland", name: "Station 114", address: "5845 Falbourne Street", buildYears: "1990" },
        115: { neighbourhood: "Central Erin Mills", name: "Station 115", address: "4595 Glen Erin Drive", buildYears: "1991" },
        116: { neighbourhood: "West Airport", name: "Station 116", address: "6825 Tomken Road", buildYears: "2011-12" },
        117: { neighbourhood: "North Dixie", name: "Station 117", address: "1090 Nuvik Court", buildYears: "1999" },
        118: { neighbourhood: "East Credit", name: "Station 118", address: "1045 Bristol Road West", buildYears: "1996" },
        119: { neighbourhood: "Airport (Pearson)", name: "Station 119", address: "6375 Airport Road", buildYears: "2014-15" },
        120: { neighbourhood: "Uptown (Core/Eglinton)", name: "Station 120", address: "125 Eglinton Avenue West", buildYears: "2018-19" },
        121: { neighbourhood: "Meadowvale Village", name: "Station 121", address: "6745 Mavis Road", buildYears: "2001-02" },
        122: { neighbourhood: "Churchill Meadows", name: "Station 122", address: "3600 Thomas Street", buildYears: "2002-03" }
    };

    window.STATION_IDS = STATION_IDS;
    window.PALETTE = PALETTE;

    /* =====================================================
       MODEL CONFIG
    ===================================================== */
    const MODEL_LAYER_KEYS = new Set(['m01a', 'm01b', 'm02a', 'm02b', 'm03']);

    const MODEL_RAMPS = {
        m01: ['#deebf7', '#9ecae1', '#3182bd', '#08519c'],
        m02: ['#fff7bc', '#fee391', '#fec44f', '#d95f0e'],
        m03: ['#e5f5e0', '#a1d99b', '#31a354', '#006d2c']
    };

    const serviceAreaMeta = {};
    let serviceAreaSymbologyMode = 'station';
    let stationRtChart = null;
    let overallRtChart = null;

    function getModelFamilyFromLayerKey(layerKey) {
        if (layerKey === 'm01a' || layerKey === 'm01b') return 'm01';
        if (layerKey === 'm02a' || layerKey === 'm02b') return 'm02';
        if (layerKey === 'm03') return 'm03';
        return null;
    }

    function getModelRampColor(modelFamily, value, min, max) {
        const ramp = MODEL_RAMPS[modelFamily] || MODEL_RAMPS.m01;
        if (!Number.isFinite(value)) return '#cccccc';
        if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return ramp[ramp.length - 1];

        const t = Math.max(0, Math.min(1, (value - min) / (max - min)));

        if (t <= 0.33) return ramp[0];
        if (t <= 0.66) return ramp[1];
        if (t <= 0.90) return ramp[2];
        return ramp[3];
    }

    function computeModelStats(fc) {
        const allocVals = [];
        const stationRtMap = new Map();

        (fc.features || []).forEach(f => {
            const p = f.properties || {};
            const st = toNum(ci(
                p,
                'Station',
                'Areas',
                'Low_Hazard'
            ));

            const alloc = toNum(ci(
                p,
                'Alloc_Zone',
                'Allc_Zones'
            ));
            const rt = toNum(ci(p, 'RT'));

            if (alloc !== null) allocVals.push(alloc);

            if (st !== null) {
                if (!stationRtMap.has(st)) stationRtMap.set(st, []);
                if (rt !== null) stationRtMap.get(st).push(rt);
            }
        });

        const allocMin = allocVals.length ? Math.min(...allocVals) : null;
        const allocMax = allocVals.length ? Math.max(...allocVals) : null;

        const stationRT = Array.from(stationRtMap.entries())
            .map(([station, values]) => ({
                station,
                rt: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
            }))
            .sort((a, b) => a.station - b.station);

        return { allocMin, allocMax, stationRT };
    }

    /* =====================================================
       LAYERS / STYLES
    ===================================================== */
    function styleForStation(st) {
        if (st === 113 || st === '113') return null;
        if (st == null || st === 0 || st === '0') {
            return { color: '#999', weight: 0.8, fillOpacity: 0, fillColor: '#999' };
        }
        const c = COLOR[String(st)] ?? '#999';
        return { color: '#333', weight: 0.6, fillOpacity: 0.55, fillColor: c };
    }

    function getServiceAreaStyle(props, modelFamily, layerKey) {
        const st = toNum(ci(
            props,
            'Station',
            'Areas',
            'Low_Hazard'
        ));

        const alloc = toNum(ci(
            props,
            'Alloc_Zone',
            'Allc_Zones'
        ));

        if (serviceAreaSymbologyMode === 'alloc') {
            const meta = serviceAreaMeta[layerKey] || {};
            const fill = getModelRampColor(modelFamily, alloc, meta.allocMin, meta.allocMax);
            return {
                color: '#333',
                weight: 0.7,
                fillColor: fill,
                fillOpacity: 0.65
            };
        }

        const stationStyle = styleForStation(st);
        return stationStyle || { color: '#999', weight: 0.8, fillOpacity: 0, fillColor: '#999' };
    }

    function getModelFeatureStyle(feat, layerKey) {
        const props = feat?.properties || {};
        const meta = serviceAreaMeta[layerKey] || {};
        const modelFamily = meta.modelFamily || getModelFamilyFromLayerKey(layerKey);
        return getServiceAreaStyle(props, modelFamily, layerKey);
    }

    function refreshServiceAreaSymbology() {
        Object.values(serviceAreaMeta).forEach(meta => {
            if (!meta.geoJsonLayer) return;
            meta.geoJsonLayer.setStyle(feat => getModelFeatureStyle(feat, meta.layerKey));
        });
        updateAllocLegend();
    }

    function updateAllocLegend() {
        if (window.__legend && typeof window.__legend.refresh === 'function') {
            window.__legend.refresh();
        }
    }

    function getActiveModelLayers() {
        return Object.values(serviceAreaMeta)
            .filter(meta => MODEL_LAYER_KEYS.has(meta.layerKey))
            .filter(meta => meta.group && map.hasLayer(meta.group));
    }

    /* =====================================================
       LEGEND
    ===================================================== */
    window.__legend = (function () {
        let ctrl;
        let isOpen = false;
        const visibleKeys = new Set();
        let heatActive = false;
        let heatMin = null;
        let heatMax = null;

        const ORDER = [
            { type: 'label', key: 'stations', label: 'Fire Stations' },
            { type: 'label', key: 'spread', label: 'Incidents Spread' },
            { type: 'heat', key: 'heat', label: 'Incidents Heat Map' },
            { type: 'sa', key: 'm01a', label: 'Model01.a' },
            { type: 'sa', key: 'm01b', label: 'Model01.b' },
            { type: 'sa', key: 'm02a', label: 'Model02.a' },
            { type: 'sa', key: 'm02b', label: 'Model02.b' },
            { type: 'sa', key: 'm03', label: 'Model03' }
        ];

        const HEAT_LEFT = '#f7fbff';
        const HEAT_RIGHT = '#08306b';

        function sectionHTML(entry) {
            const { key, label } = entry;

            // Fire stations legend: show only in station-color mode
            if (key === 'stations') {
                if (serviceAreaSymbologyMode !== 'station') return '';

                let s = `
<div style="
    min-width:160px;
    padding:4px;
">
    <b>${label}</b>
    <div style="
        display:grid;
        grid-template-columns:repeat(3, auto);
        gap:4px 10px;
        margin-top:6px;
    ">
`;

                for (const id of STATION_IDS) {
                    s += `
        <div style="display:flex;align-items:center;white-space:nowrap;">
            <span style="
                display:inline-block;
                width:16px;
                height:12px;
                border:1px solid #999;
                margin-right:4px;
                background:${COLOR[String(id)]};
            "></span>${id}
        </div>`;
                }

                s += `
    </div>
</div>`;
                return s;
            }

            // Heat map legend
            if (key === 'heat') {
                if (heatActive && Number.isFinite(heatMin) && Number.isFinite(heatMax)) {
                    return `
<div style="
    display:flex;
    align-items:center;
    gap:8px;
    margin-top:6px;
    min-width:220px;
">
    <b style="white-space:nowrap;">${label}</b>
    <span style="font-size:12px;">${heatMin.toFixed(1)}</span>
    <div style="
        height:12px;
        width:120px;
        border:1px solid #999;
        background:linear-gradient(90deg, ${HEAT_LEFT}, ${HEAT_RIGHT});
    "></div>
    <span style="font-size:12px;">${heatMax.toFixed(1)}</span>
</div>
`;
                }
                return '';
            }

            if (entry.type === 'sa') {
                if (!visibleKeys.has(key)) return '';

                if (serviceAreaSymbologyMode === 'station') return '';

                const meta = serviceAreaMeta[key];
                if (!meta) return '';

                const ramp = MODEL_RAMPS[meta.modelFamily];
                if (!ramp) return '';

                const minVal = meta.allocMin;
                const maxVal = meta.allocMax;

                return `
<div style="
    min-width:220px;
    padding:4px;
">
    <b style="white-space:nowrap;">${meta.label}</b>
    <div style="
        display:flex;
        align-items:center;
        gap:8px;
        margin-top:6px;
    ">
        <span style="font-size:12px;">${Number.isFinite(minVal) ? minVal.toFixed(1) : 'NA'}</span>
        <div style="
            height:12px;
            width:120px;
            border:1px solid #999;
            background:linear-gradient(90deg, ${ramp[0]}, ${ramp[1]}, ${ramp[2]}, ${ramp[3]});
        "></div>
        <span style="font-size:12px;">${Number.isFinite(maxVal) ? maxVal.toFixed(1) : 'NA'}</span>
    </div>
</div>
`;
            }

            
            return visibleKeys.has(key) ? `
<div style="
    min-width:120px;
    padding:4px;
    white-space:nowrap;
">
    <b>${label}</b>
</div>
` : '';
        }

        function innerHTML() {
            let html = '';

            for (const entry of ORDER) {
                html += sectionHTML(entry);
            }

            return html;
        }

        function ensure() {
            if (ctrl) return ctrl;

            ctrl = L.control({ position: 'bottomleft' });

            ctrl.onAdd = () => {
                const wrap = L.DomUtil.create('div', 'legend leaflet-bar');
                wrap.style.background = '#ffffff';
                wrap.style.border = '1px solid #aaa';
                wrap.style.minWidth = '120px';
                wrap.style.maxWidth = '700px';
                wrap.style.whiteSpace = 'normal';
                wrap.style.borderRadius = '4px';
                wrap.style.boxShadow = '0 0 5px rgba(0,0,0,.3)';

                const header = L.DomUtil.create('div', 'legend-header', wrap);
                header.style.display = 'flex';
                header.style.alignItems = 'center';
                header.style.justifyContent = 'space-between';
                header.style.cursor = 'pointer';
                header.style.padding = '6px 8px';
                header.style.fontWeight = '600';
                header.style.background = '#f0f0f0';
                header.innerHTML = `<span>Legend</span><span class="legend-caret" style="font-weight:700;user-select:none;">${isOpen ? '▾' : '▸'}</span>`;

                const body = L.DomUtil.create('div', 'legend-body', wrap);
                body.style.display = isOpen ? 'flex' : 'none';
                body.style.flexDirection = 'row';
                body.style.flexWrap = 'wrap';
                body.style.alignItems = 'flex-start';
                body.style.gap = '12px';
                body.style.padding = '6px 8px';
                body.style.maxWidth = '600px';
                body.style.background = '#fafafa';
                body.innerHTML = innerHTML();

                function toggle() {
                    isOpen = !isOpen;
                    body.style.display = isOpen ? 'flex' : 'none';
                    header.querySelector('.legend-caret').textContent = isOpen ? '▾' : '▸';
                }

                header.addEventListener('click', toggle);
                L.DomEvent.disableClickPropagation(wrap);
                L.DomEvent.disableScrollPropagation(wrap);

                return wrap;
            };

            ctrl.addTo(map);
            return ctrl;
        }

        function refresh() {
            const body = ctrl?.getContainer()?.querySelector('.legend-body');
            if (body) body.innerHTML = innerHTML();
        }

        return {
            ensure,
            refresh,
            setCollapsed(v) {
                if (!ctrl) ensure();
                const h = ctrl.getContainer().querySelector('.legend-header');
                const body = h.nextSibling;
                const open = body.style.display === 'flex';
                if (!!v === open) h.click();
            },
            addKey(key) {
                ensure();
                visibleKeys.add(key);
                refresh();
            },
            removeKey(key) {
                visibleKeys.delete(key);
                refresh();
            },
            setHeatLegend(active, min, max) {
                ensure();
                heatActive = !!active;
                heatMin = min ?? null;
                heatMax = max ?? null;
                refresh();
            },
            setSectionVisible(key, v) {
                ensure();
                if (v) visibleKeys.add(key);
                else visibleKeys.delete(key);
                refresh();
            }
        };
    })();

    window.__legend.ensure();
    window.__legend.setCollapsed(true);

    /* =====================================================
       FILTER STATE
    ===================================================== */
    window.__serviceAreaRegistry = [];
    const activeStations = new Set(STATION_IDS);

    function applyStationFilter() {
        for (const rec of window.__serviceAreaRegistry) {
            const grp = rec.parent;
            if (!map.hasLayer(grp)) continue;

            const wantOn = activeStations.has(rec.stationId);
            const hasIt = grp.hasLayer(rec.layer);

            if (wantOn && !hasIt) grp.addLayer(rec.layer);
            else if (!wantOn && hasIt) grp.removeLayer(rec.layer);
        }
    }

    /* =====================================================
       GEOJSON BUILDERS
    ===================================================== */
    function buildGeoJSONServiceArea(fc, layerLabel, stationKeyCandidates, layerKey, modelFamily) {
        const group = L.layerGroup();

        const stats = computeModelStats(fc);

        serviceAreaMeta[layerKey] = {
            layerKey,
            label: layerLabel,
            modelFamily,
            group,
            geoJsonLayer: null,
            fc,
            allocMin: stats.allocMin,
            allocMax: stats.allocMax,
            stationRT: stats.stationRT
        };

        const gj = L.geoJSON(fc, {
            style: feat => getModelFeatureStyle(feat, layerKey),

            onEachFeature: (feat, layer) => {
                const props = feat?.properties || {};

                let stRaw = getPropCI(
                    props,
                    ...stationKeyCandidates,
                    'Station',
                    'Areas',
                    'Low_Hazard',
                    'STATION',
                    'station',
                    'Station_ID',
                    'STATION_ID',
                    'Fire_Station'
                );

                if (typeof stRaw === 'string') {
                    const m = stRaw.match(/\d+/);
                    if (m) stRaw = Number(m[0]);
                }

                const popupRows = Object.entries(props)
                    .map(([k, v]) => `<div><b>${k}:</b> ${v ?? '—'}</div>`)
                    .join('');

                layer.bindPopup(`
<div class="layer-badge">${layerLabel}</div>
<div><b>Station:</b> ${stRaw ?? '—'}</div>
<div style="margin-top:6px; max-height:180px; overflow:auto;">
    ${popupRows}
</div>
                `);

                window.__serviceAreaRegistry.push({
                    layer,
                    stationId: Number(stRaw),
                    parent: group,
                    baseStyle: layer.options,
                    layerKey
                });

                layer.__feature = feat;
                layer.__layerKey = layerKey;
            }
        });

        gj.eachLayer(l => group.addLayer(l));

        serviceAreaMeta[layerKey].geoJsonLayer = gj;

        group.__geojson = gj;
        group.__layerKey = layerKey;
        group.__label = layerLabel;
        group.__fc = fc;
        group.__modelFamily = modelFamily;

        group.on('add', () => {
            window.__legend.addKey(layerKey);
            applyStationFilter();
            refreshStationRtChart();
        });

        group.on('remove', () => {
            window.__legend.removeKey(layerKey);
            refreshStationRtChart();
        });

        return group;
    }

    function buildIncidentsSpread_GeoJSON(fc, name) {
        return L.geoJSON(fc, {
            style: f => {
                const raw = ci(f?.properties || {}, 'STATION');
                const st = (String(raw).toUpperCase() === '1CH') ? '1CH' : (Number.isFinite(+raw) ? +raw : raw);
                const style = styleForStation(st);
                return style || { opacity: 0, fillOpacity: 0 };
            },
            onEachFeature: (feat, layer) => {
                const st = ci(feat.properties || {}, 'STATION');
                layer.bindPopup(`
<div class="layer-badge">${name}</div>
<b>Station:</b> ${st ?? '—'}
                `);
            }
        });
    }

    const HEAT_LEFT = '#f7fbff';
    const HEAT_RIGHT = '#08306b';

    const lerp = (a, b, t) => a + (b - a) * t;

    const hexToRgb = hex => {
        const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
    };

    const rgbToHex = (r, g, b) => {
        const h = n => ('0' + n.toString(16)).slice(-2);
        return '#' + h(Math.round(Math.max(0, Math.min(255, r))))
            + h(Math.round(Math.max(0, Math.min(255, g))))
            + h(Math.round(Math.max(0, Math.min(255, b))));
    };

    function rampColor(t) {
        const a = hexToRgb(HEAT_LEFT), b = hexToRgb(HEAT_RIGHT);
        return rgbToHex(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t));
    }

    function parseStationIdFromName(a) {
        const nm = ci(a, 'STATION', 'Station', 'Station_ID', 'StationID', 'NAME', 'LANDMARKNA');
        if (nm != null) {
            const m = String(nm).match(/(\b1?\d{2,3}\b)/);
            if (m) {
                const n = Number(m[1]);
                return Number.isFinite(n) ? n : m[1];
            }
            return nm;
        }
        const oid = ci(a, 'OBJECTID', 'FID');
        const n = Number(oid);
        return Number.isFinite(n) ? n : (oid ?? null);
    }

    function stylePoint(st) {
        if (st === 113 || st === '113') return null;
        const fill = COLOR[String(st)] || '#e41a1c';
        return { radius: 8, fillColor: fill, color: '#222', weight: 1, fillOpacity: 0.9 };
    }

    function buildPoints_GeoJSON(fc, name) {
        const group = L.layerGroup();

        const gj = L.geoJSON(fc, {
            pane: 'pointsPane',
            pointToLayer: (feat, latlng) => {
                const a = feat.properties || {};
                const stRaw = parseStationIdFromName(a);
                const stNum = Number.isFinite(+stRaw) ? +stRaw : stRaw;

                const style = stylePoint(stNum);
                if (!style) {
                    return L.circleMarker(latlng, { radius: 0, opacity: 0, fillOpacity: 0, pane: 'pointsPane' });
                }

                const meta = STATION_META[stNum] || STATION_META[String(stNum)] || {};
                const nameFallback = ci(a, 'LANDMARKNA', 'NAME', 'STATION') ?? `Station ${stNum ?? '—'}`;

                const popupHtml = `
<div class="layer-badge">${name}</div>
<div style="margin-top:4px">
  <div><b>Name:</b> ${meta.name ?? nameFallback}</div>
  <div><b>Address:</b> ${meta.address ?? '—'}</div>
  <div><b>Neighbourhood:</b> ${meta.neighbourhood ?? '—'}</div>
  <div><b>Build years:</b> ${meta.buildYears ?? '—'}</div>
</div>
                `;

                const marker = L.circleMarker(latlng, { ...style, pane: 'pointsPane' }).bindPopup(popupHtml);

                const label = L.marker(latlng, {
                    pane: 'labelsPane',
                    icon: L.divIcon({
                        className: 'stn-label',
                        html: `<div style="color:#000;font-weight:bold;text-shadow:1px 1px 2px #fff;font-size:12px;">${stNum ?? ''}</div>`,
                        iconAnchor: [0, 0]
                    }),
                    interactive: false
                });

                group.addLayer(label);
                return marker;
            }
        });

        group.addLayer(gj);
        return group;
    }

    /* =====================================================
       CONFIG
    ===================================================== */
    const SA_LAYERS = [
        {
            key: 'm01a',
            label: 'Model01.a',
            url: './data/Model_01a.geojson',
            stationKeys: ['Station'],
            modelFamily: 'm01'
        },
        {
            key: 'm01b',
            label: 'Model01.b',
            url: './data/Model_01b.geojson',
            stationKeys: ['Areas'],
            modelFamily: 'm01'
        },
        {
            key: 'm02a',
            label: 'Model02.a',
            url: './data/Model_02a.geojson',
            stationKeys: ['Station'],
            modelFamily: 'm02'
        },
        {
            key: 'm02b',
            label: 'Model02.b',
            url: './data/Model_02b.geojson',
            stationKeys: ['Low_Hazard'],
            modelFamily: 'm02'
        },
        {
            key: 'm03',
            label: 'Model03',
            url: './data/Model_03.geojson',
            stationKeys: ['Low_Hazard'],
            modelFamily: 'm03'
        }
    ];

    const NAME_SPREAD = 'Incidents – Spread';
    const URL_SPREAD = './data/Incidents_Spread.geojson';

    const NAME_HEAT = 'Incidents – Heat Map';
    const URL_HEAT = './data/Incidents_Heat_Map.geojson';

    const NAME_POINTS = 'Fire Stations';
    const URL_POINTS = './data/Fire_Stations.geojson';

    const NAME_BOUNDARY = 'City of Mississauga Boundary';
    const URL_BOUNDARY = './data/City Of Mississauag_Boundary.geojson';

    const overlays = {};

    const LAYER_ORDER = [
        'Fire Stations',
        'City of Mississauga Boundary',
        'Incidents – Spread',
        'Incidents – Heat Map',
        'Model01.a',
        'Model01.b',
        'Model02.a',
        'Model02.b',
        'Model03'
    ];

    /* =====================================================
       HIDDEN LEAFLET CONTROL
    ===================================================== */
    let layerControl = L.control.layers(null, {}, { collapsed: true }).addTo(map);
    window.layerControl = layerControl;

    setTimeout(() => {
        const lcEl = document.querySelector('.leaflet-control-layers');
        if (lcEl) lcEl.style.display = 'none';
    }, 0);

    /* =====================================================
       CHARTS
    ===================================================== */
    function refreshOverallRtChartVisibility() {
        const panel = ensureOverallRtChartContainer();
        const toggle = document.getElementById('overall-rt-chart-toggle');
        if (!panel || !toggle) return;
        panel.style.display = toggle.checked ? 'block' : 'none';
    }

    function buildOverallRtChart() {
        if (typeof Chart === 'undefined') {
            console.error('[RT Chart] Chart.js not loaded.');
            return;
        }

        const canvas = document.getElementById('rtChart');
        if (!canvas) {
            console.error('[RT Chart] Canvas with id="rtChart" not found.');
            return;
        }

        const ctx = canvas.getContext('2d');

        if (overallRtChart) {
            overallRtChart.destroy();
            overallRtChart = null;
        }

        overallRtChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ["Model01", "Model02", "Model03"],
                datasets: [
                    {
                        label: "Existing",
                        data: [276, 629, null],
                        backgroundColor: [
                            '#08519c', 
                            '#d95f0e', 
                            'rgba(0,0,0,0)' 
                        ],
                        borderColor: [
                            '#333',
                            '#333',
                            'rgba(0,0,0,0)'
                        ],
                        borderWidth: 1
                    },
                    {
                        label: "Optimized",
                        data: [230, 538, 541],
                        backgroundColor: [
                            '#9ecae1', 
                            '#fee391', 
                            '#a1d99b' 
                        ],
                        borderColor: [
                            '#333',
                            '#333',
                            '#333'
                        ],
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: "Seconds"
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Overall Response Time Comparison'
                    },
                    tooltip: {
                        callbacks: {
                            label(ctx) {
                                if (ctx.raw === null) return `${ctx.dataset.label}: NA`;
                                return `${ctx.dataset.label}: ${ctx.raw} sec`;
                            }
                        }
                    }
                }
            },
            plugins: [{
                id: 'showNA',
                afterDatasetsDraw(chart) {
                    const { ctx } = chart;
                    const meta = chart.getDatasetMeta(0);

                    ctx.save();
                    ctx.font = '12px sans-serif';
                    ctx.fillStyle = '#666';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';

                    meta.data.forEach((bar, i) => {
                        if (chart.data.datasets[0].data[i] === null) {
                            const x = bar.x;
                            const y = chart.scales.y.getPixelForValue(0);
                            ctx.fillText('NA', x, y - 4);
                        }
                    });

                    ctx.restore();
                }
            }]
        });

        console.log('[RT Chart] Overall response-time chart rendered ✅');
    }

    function refreshStationRtChart() {
        const panel = ensureStationRtChartContainer();
        if (!panel) return;

        const chartToggle = document.getElementById('rt-chart-toggle');
        if (chartToggle && !chartToggle.checked) {
            panel.style.display = 'none';
            return;
        }

        const activeModels = getActiveModelLayers();

        if (!activeModels.length) {
            panel.style.display = 'none';
            if (stationRtChart) {
                stationRtChart.destroy();
                stationRtChart = null;
            }
            return;
        }

        panel.style.display = 'block';

        const canvas = document.getElementById('stationRtChart');
        if (!canvas || typeof Chart === 'undefined') return;

        const ctx = canvas.getContext('2d');
        const stationSet = new Set();

        activeModels.forEach(m => {
            m.stationRT.forEach(d => stationSet.add(d.station));
        });

        const labels = Array.from(stationSet).sort((a, b) => a - b).map(String);

        const datasetColors = {
            m01a: '#08519c', 
            m01b: '#9ecae1', 

            m02a: '#d95f0e', 
            m02b: '#fee391', 

            m03: '#006d2c'  
        };

        const datasets = activeModels.map(meta => {
            const lookup = new Map(meta.stationRT.map(d => [String(d.station), d.rt]));
            return {
                label: meta.label,
                data: labels.map(st => lookup.has(st) ? lookup.get(st) : null),
                backgroundColor: datasetColors[meta.layerKey] || '#777',
                borderColor: '#333',
                borderWidth: 1
            };
        });

        if (stationRtChart) {
            stationRtChart.destroy();
            stationRtChart = null;
        }

        stationRtChart = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: {
                        title: { display: true, text: 'Station' }
                    },
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Response Time (RT)' }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Station Response Time by Active Model Layer'
                    },
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label(ctx) {
                                const v = ctx.raw;
                                return `${ctx.dataset.label}: ${v == null ? 'NA' : Number(v).toFixed(1)}`;
                            }
                        }
                    }
                }
            }
        });
    }

    /* =====================================================
       LOADERS
    ===================================================== */
    const serviceAreasLoaded = Promise.all(SA_LAYERS.map(async cfg => {
        const fc = await fetchJson(cfg.url);

        if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
            throw new Error(`${cfg.label}: Not a valid GeoJSON FeatureCollection`);
        }

        const grp = buildGeoJSONServiceArea(fc, cfg.label, cfg.stationKeys, cfg.key, cfg.modelFamily);
        overlays[cfg.label] = grp;
        layerControl.addOverlay(grp, cfg.label);
        return grp;
    })).then(() => {
        refreshServiceAreaSymbology();

        const eg = overlays['Model01.a'];
        if (eg) {
            const b = L.featureGroup(eg.getLayers()).getBounds();
            if (b.isValid()) map.fitBounds(b, { padding: [20, 20] });
        }
    }).catch(err => {
        console.error('[Service Areas] failed:', err);
    });

    const incidentsLoaded = (async () => {
        try {
            const fc = await fetchJson(URL_SPREAD);
            const spread = buildIncidentsSpread_GeoJSON(fc, NAME_SPREAD);
            spread.on('add', () => window.__legend.setSectionVisible('spread', true));
            spread.on('remove', () => window.__legend.setSectionVisible('spread', false));
            overlays[NAME_SPREAD] = spread;
            layerControl.addOverlay(spread, NAME_SPREAD);
        } catch (e) {
            console.error('[Incidents] Spread failed:', e);
        }

        try {
            const fc = await fetchJson(URL_HEAT);
            const vals = (fc.features || [])
                .map(f => Number(ci(f.properties || {}, 'Incidents')))
                .filter(Number.isFinite);

            const min = vals.length ? Math.min(...vals) : 0;
            const max = vals.length ? Math.max(...vals) : 1;
            const span = (max - min) || 1;

            const heatLayer = L.geoJSON(fc, {
                style: f => {
                    const v = Number(ci(f.properties || {}, 'Incidents'));
                    const t = Number.isFinite(v) ? Math.max(0, Math.min(1, (v - min) / span)) : 0;
                    return { color: '#333', weight: 0.4, fillOpacity: 0.55, fillColor: rampColor(t) };
                },
                onEachFeature: (feat, l) => {
                    const v = Number(ci(feat.properties || {}, 'Incidents'));
                    l.bindPopup(`
<div class="layer-badge">${NAME_HEAT}</div>
<b>Incidents:</b> ${Number.isFinite(v) ? v : '—'}
                    `);
                }
            });

            heatLayer.on('add', () => window.__legend.setHeatLegend(true, min, max));
            heatLayer.on('remove', () => window.__legend.setHeatLegend(false, null, null));
            overlays[NAME_HEAT] = heatLayer;
            layerControl.addOverlay(heatLayer, NAME_HEAT);
        } catch (e) {
            console.error('[Incidents] Heat failed:', e);
        }

        try {
            const fc = await fetchJson(URL_POINTS);
            const pts = buildPoints_GeoJSON(fc, NAME_POINTS);
            overlays[NAME_POINTS] = pts;
            layerControl.addOverlay(pts, NAME_POINTS);
        } catch (e) {
            console.error('[Incidents] Points failed:', e);
        }
    })();

    const boundaryLoaded = (async () => {
        try {
            const fc = await fetchJson(URL_BOUNDARY);
            const boundary = L.geoJSON(fc, {
                style: { color: '#000000', weight: 2, fillOpacity: 0 },
                interactive: false
            });
            overlays[NAME_BOUNDARY] = boundary;
            layerControl.addOverlay(boundary, NAME_BOUNDARY);
        } catch (e) {
            console.error('[Boundary] failed:', e);
        }
    })();

    /* =====================================================
       RIGHT PANEL
    ===================================================== */
    let rightPanelControl;

    function buildRightPanelControl() {
        if (rightPanelControl) return;

        rightPanelControl = L.control({ position: 'topleft' });

        rightPanelControl.onAdd = function () {
            const wrap = L.DomUtil.create('div', 'leaflet-bar');
            wrap.style.background = '#f3f3f3';
            wrap.style.border = '1px solid #999';
            wrap.style.borderRadius = '4px';
            wrap.style.boxShadow = '0 0 5px rgba(0,0,0,.3)';
            wrap.style.minWidth = '260px';
            wrap.style.maxHeight = '60vh';
            wrap.style.overflow = 'hidden';
            wrap.style.display = 'flex';
            wrap.style.flexDirection = 'column';

            const header = L.DomUtil.create('div', '', wrap);
            header.style.display = 'flex';
            header.style.alignItems = 'center';
            header.style.justifyContent = 'space-between';
            header.style.cursor = 'pointer';
            header.style.padding = '6px 8px';
            header.style.fontWeight = '600';
            header.style.background = '#e0e0e0';
            header.innerHTML = `<span>Layers & Filters</span><span class="rp-caret" style="font-weight:700;user-select:none;">▾</span>`;

            const body = L.DomUtil.create('div', '', wrap);
            body.style.display = 'block';
            body.style.padding = '6px 8px';
            body.style.overflow = 'auto';
            body.style.background = '#f8f8f8';

            // Layers
            const layersSec = document.createElement('div');
            layersSec.innerHTML = `<div style="font-weight:600;margin-bottom:4px;">Layers</div>`;

            const layersList = document.createElement('div');
            layersList.style.display = 'flex';
            layersList.style.flexDirection = 'column';
            layersList.style.gap = '2px';

            LAYER_ORDER.forEach(name => {
                const lyr = overlays[name];
                if (!lyr) return;

                const lbl = document.createElement('label');
                lbl.style.display = 'flex';
                lbl.style.alignItems = 'center';
                lbl.style.gap = '4px';

                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.dataset.layerName = name;
                cb.checked = map.hasLayer(lyr);

                lbl.appendChild(cb);

                const span = document.createElement('span');
                span.textContent = name;
                lbl.appendChild(span);

                layersList.appendChild(lbl);
            });

            layersSec.appendChild(layersList);
            body.appendChild(layersSec);

            // Symbology
            const symSec = document.createElement('div');
            symSec.style.marginTop = '8px';
            symSec.innerHTML = `<div style="font-weight:600;margin-bottom:4px;">Model Symbology</div>`;

            const symSelect = document.createElement('select');
            symSelect.style.width = '100%';
            symSelect.style.padding = '4px';
            symSelect.innerHTML = `
<option value="station">Station colors</option>
<option value="alloc">Allocated zones</option>
            `;
            symSelect.value = serviceAreaSymbologyMode;

            symSelect.addEventListener('change', () => {
                serviceAreaSymbologyMode = symSelect.value;
                refreshServiceAreaSymbology();
            });

            symSec.appendChild(symSelect);
            body.appendChild(symSec);

            // Station filter
            const sfSec = document.createElement('div');
            sfSec.style.marginTop = '8px';
            sfSec.innerHTML = `<div style="font-weight:600;margin-bottom:4px;">Filter: Stations</div>`;

            const controls = document.createElement('div');
            controls.style.marginBottom = '6px';

            const btnAll = document.createElement('button');
            btnAll.type = 'button';
            btnAll.textContent = 'All';
            btnAll.style.marginRight = '4px';

            const btnNone = document.createElement('button');
            btnNone.type = 'button';
            btnNone.textContent = 'None';

            controls.appendChild(btnAll);
            controls.appendChild(btnNone);
            sfSec.appendChild(controls);

            const grid = document.createElement('div');
            grid.style.display = 'grid';
            grid.style.gridTemplateColumns = 'repeat(5, 1fr)';
            grid.style.columnGap = '6px';
            grid.style.rowGap = '4px';
            grid.style.fontSize = '12px';

            STATION_IDS.forEach(id => {
                const lbl = document.createElement('label');
                lbl.style.display = 'inline-flex';
                lbl.style.alignItems = 'center';

                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.style.marginRight = '4px';
                cb.dataset.st = String(id);
                cb.checked = activeStations.has(id);

                lbl.appendChild(cb);
                lbl.appendChild(document.createTextNode(String(id)));
                grid.appendChild(lbl);
            });

            sfSec.appendChild(grid);
            body.appendChild(sfSec);

            // Charts
            const chartSec = document.createElement('div');
            chartSec.style.marginTop = '8px';
            chartSec.innerHTML = `<div style="font-weight:600;margin-bottom:4px;">Response Time Charts</div>`;

            const overallChartRow = document.createElement('label');
            overallChartRow.style.display = 'flex';
            overallChartRow.style.alignItems = 'center';
            overallChartRow.style.gap = '4px';
            overallChartRow.style.marginBottom = '4px';

            const overallChartCb = document.createElement('input');
            overallChartCb.type = 'checkbox';
            overallChartCb.id = 'overall-rt-chart-toggle';

            const overallChartPanel = document.getElementById('rt-chart-container');
            if (overallChartPanel) {
                overallChartPanel.style.display = 'none';
                overallChartCb.checked = false;
            }

            overallChartRow.appendChild(overallChartCb);
            overallChartRow.appendChild(document.createTextNode('Overall Average Response Time Chart'));
            chartSec.appendChild(overallChartRow);

            const stationChartRow = document.createElement('label');
            stationChartRow.style.display = 'flex';
            stationChartRow.style.alignItems = 'center';
            stationChartRow.style.gap = '4px';

            const stationChartCb = document.createElement('input');
            stationChartCb.type = 'checkbox';
            stationChartCb.id = 'rt-chart-toggle';

            const stationChartPanel = document.getElementById('station-rt-chart-container');
            if (stationChartPanel) {
                stationChartPanel.style.display = 'none';
                stationChartCb.checked = false;
            }

            stationChartRow.appendChild(stationChartCb);
            stationChartRow.appendChild(document.createTextNode('Stations Average Response Time Chart'));
            chartSec.appendChild(stationChartRow);

            body.appendChild(chartSec);

            // Header toggle
            header.addEventListener('click', () => {
                const isOpen = body.style.display !== 'none';
                body.style.display = isOpen ? 'none' : 'block';
                header.querySelector('.rp-caret').textContent = isOpen ? '▸' : '▾';
            });

            // Layer toggle
            layersList.addEventListener('change', e => {
                const t = e.target;
                if (!t.matches('input[type="checkbox"][data-layer-name]')) return;

                const name = t.dataset.layerName;
                const lyr = overlays[name];
                if (!lyr) return;

                if (t.checked) map.addLayer(lyr);
                else map.removeLayer(lyr);

                ensurePointsOnTop();
                refreshStationRtChart();
            });

            // Station all/none
            btnAll.onclick = () => {
                activeStations.clear();
                STATION_IDS.forEach(id => activeStations.add(id));
                grid.querySelectorAll('input[data-st]').forEach(cb => { cb.checked = true; });
                applyStationFilter();
            };

            btnNone.onclick = () => {
                activeStations.clear();
                grid.querySelectorAll('input[data-st]').forEach(cb => { cb.checked = false; });
                applyStationFilter();
            };

            // Station checkbox filter
            grid.addEventListener('change', e => {
                const t = e.target;
                if (!t.matches('input[data-st]')) return;

                const id = Number(t.dataset.st);
                if (t.checked) activeStations.add(id);
                else activeStations.delete(id);

                applyStationFilter();
            });

            // Overall chart toggle
            overallChartCb.addEventListener('change', () => {
                refreshOverallRtChartVisibility();
            });

            // Station chart toggle
            stationChartCb.addEventListener('change', () => {
                const panel = document.getElementById('station-rt-chart-container');
                if (!panel) return;

                if (stationChartCb.checked) {
                    refreshStationRtChart();
                    if (!getActiveModelLayers().length) panel.style.display = 'none';
                } else {
                    panel.style.display = 'none';
                }
            });

            L.DomEvent.disableClickPropagation(wrap);
            L.DomEvent.disableScrollPropagation(wrap);

            return wrap;
        };

        rightPanelControl.addTo(map);
    }

    /* =====================================================
       INIT
    ===================================================== */
    Promise.all([serviceAreasLoaded, incidentsLoaded, boundaryLoaded]).then(() => {
        if (overlays[NAME_POINTS]) overlays[NAME_POINTS].addTo(map);
        if (overlays[NAME_BOUNDARY]) overlays[NAME_BOUNDARY].addTo(map);

        ensurePointsOnTop();
        buildRightPanelControl();
        buildOverallRtChart();
    });

    map.on('layeradd layerremove', ensurePointsOnTop);

})();