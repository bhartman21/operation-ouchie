import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';
import { DiagnosticCode, SystemGrouping } from '../models/rating.model';

@Injectable({
    providedIn: 'root'
})
export class RatingDataService {

    private dataUrl = 'data/ratings.json';
    private ratingsCache$: Observable<DiagnosticCode[]> | null = null;

    constructor(private http: HttpClient) { }

    getRatings(): Observable<DiagnosticCode[]> {
        if (!this.ratingsCache$) {
            this.ratingsCache$ = this.http.get<DiagnosticCode[]>(this.dataUrl).pipe(
                shareReplay(1)
            );
        }
        return this.ratingsCache$;
    }

    getSystemGroupings(): Observable<SystemGrouping[]> {
        return this.getRatings().pipe(
            map(ratings => {
                const systems = new Map<string, Set<string>>();

                ratings.forEach(r => {
                    if (!systems.has(r.system)) {
                        systems.set(r.system, new Set<string>());
                    }
                    if (r.subSystem) {
                        systems.get(r.system)?.add(r.subSystem);
                    }
                });

                const result: SystemGrouping[] = [];
                // Sort keys (systems)
                Array.from(systems.keys()).sort().forEach(sys => {
                    result.push({
                        name: sys,
                        subSystems: Array.from(systems.get(sys) || []).sort()
                    });
                });

                return result;
            })
        );
    }
}
