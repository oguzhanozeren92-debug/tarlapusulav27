import type { DemGridCell } from '../../../services/demService';
export type FrostPocketCell = DemGridCell & { relativeElevationM:number|null; susceptibility:'low'|'medium'|'high' };
export type FrostEventRecord = { id:string; fieldId:string; eventDate:string; observedMinTempC:number|null; source:'user'|'weather_station'|'sensor'; notes:string|null; createdAt:string };
export type FrostPocketSnapshot = {
 version:'20.0'; fieldId:string; crop:string|null; status:'ready'|'needs_data'|'error';
 terrain:{ source:'Copernicus DEM GLO-90'; resolutionMeters:90; reliefM:number|null; cells:FrostPocketCell[]; highPocketCount:number; mediumPocketCount:number; };
 forecast:{ minTemperatureC:number|null; frostSignal:'none'|'watch'|'frost'; };
 latestEvent:FrostEventRecord|null;
 postEventSatellite:{ status:'unavailable'|'no_negative_signal'|'negative_change_after_event'; latestDate:string|null; deviation:number|null; note:string };
 evidence:string[]; guardrails:string[]; generatedAt:string;
};
