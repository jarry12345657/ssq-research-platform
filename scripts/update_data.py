#!/usr/bin/env python3
"""更新 GitHub Pages 静态历史数据。只读获取公开源，严格校验后原子替换。"""
from __future__ import annotations
import argparse
import csv
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen

SOURCE = 'https://raw.githubusercontent.com/yangxb919/lottery-data/main/data/ssq.json'
ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'web/data/history.json'
FALLBACK = ROOT / 'web/data/fallback.csv'


def normalize(rows):
    if not isinstance(rows, list) or not rows:
        raise ValueError('开奖号码必须是非空列表')
    result, issues, dates = [], set(), set()
    for x in rows:
        issue = str(x['issue'])
        date = str(x['date'])
        red = sorted(int(v) for v in x['red'])
        b = x['blue']
        blue = int(b[0] if isinstance(b, list) else b)
        if not (len(issue) == 5 and issue.isdigit() and len(date) == 10 and date[4] == '-' and date[7] == '-'
                and len(red) == 6 and len(set(red)) == 6 and all(1 <= n <= 33 for n in red)
                and 1 <= blue <= 16):
            raise ValueError(f'非法开奖记录：{issue} {date}')
        if issue in issues or date in dates:
            raise ValueError(f'重复期号或日期：{issue}')
        issues.add(issue); dates.add(date)
        result.append({'issue': issue, 'date': date, 'red': red, 'blue': blue})
    return sorted(result, key=lambda x: x['date'])


def bundled():
    rows = []
    with FALLBACK.open(encoding='utf-8') as f:
        for issue, day, r, blue in csv.reader(f):
            rows.append({'issue': issue, 'date': f'{day[:4]}-{day[4:6]}-{day[6:8]}',
                         'red': [int(r[i:i+2]) for i in range(0, 12, 2)], 'blue': int(blue)})
    return normalize(rows)


def update(offline=False, fail_on_remote=False):
    local = bundled()
    if DEST.exists():
        try:
            saved = normalize(json.loads(DEST.read_text(encoding='utf-8')))
            if saved[-1]['date'] >= local[-1]['date'] and len(saved) > len(local):
                local = saved
        except (ValueError, KeyError, TypeError):
            pass
    data, origin = local, 'bundled fallback / previous saved data'
    if not offline:
        try:
            with urlopen(Request(SOURCE, headers={'User-Agent': 'ssq-research-platform/1.0'}), timeout=35) as req:
                incoming = normalize(json.loads(req.read()))
            if len(incoming) >= len(local) and incoming[-1]['date'] >= local[-1]['date']:
                data, origin = incoming, SOURCE
            else:
                print('WARNING: 远端数据量较少或较旧，保留本地数据')
        except Exception as e:
            if fail_on_remote:
                raise
            print(f'WARNING: 远端数据获取失败，保留已有数据：{e}')
    DEST.parent.mkdir(parents=True,exist_ok=True)
    temp=DEST.with_suffix('.json.tmp')
    temp.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    os.replace(temp,DEST)
    print(f'OK records={len(data)} latest={data[-1]["issue"]} date={data[-1]["date"]} source={origin}')
    return data

if __name__ == '__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--offline', action='store_true', help='仅使用内置样本与本地已有数据')
    p.add_argument('--strict', action='store_true', help='联网失败直接退出非零')
    args=p.parse_args();update(args.offline,args.strict)
