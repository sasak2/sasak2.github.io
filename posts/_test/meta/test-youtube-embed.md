---
title: 유튜브 임베드 테스트
date: 2026-10-26
tags: [테스트]
summary: 한 줄에 유튜브 주소만 있을 때만 플레이어가 되는지 확인하는 샘플 글이에요.
---

이 글은 사이트에는 나오지 않는 테스트 글이에요. 아래 "임베드 됨" 항목은 플레이어가 보여야 하고, "임베드 안 됨" 항목은 일반 글자나 링크로 남아야 해요.

## 임베드 됨

watch 형식 (주소만 한 줄):

https://www.youtube.com/watch?v=9d2m0VUsnSk

youtu.be 형식, 시작 시간 t=1m30s:

https://youtu.be/9d2m0VUsnSk?t=1m30s

shorts 형식:

https://www.youtube.com/shorts/9d2m0VUsnSk

watch 형식에 start=45 와 다른 파라미터:

https://www.youtube.com/watch?feature=shared&v=9d2m0VUsnSk&start=45

t=90 (초 단위 숫자), 꺾쇠 자동 링크 형식:

<https://youtube.com/watch?v=9d2m0VUsnSk&t=90>

문장 바로 아래 줄에 붙여 쓴 경우 (앞 문장과 섞이지 않고 따로 플레이어가 돼요)
https://youtu.be/9d2m0VUsnSk
이 줄은 플레이어 아래에 이어지는 문장이에요.

## 임베드 안 됨

링크 문법: [이 영상 보기](https://www.youtube.com/watch?v=9d2m0VUsnSk)

문장 중간: 이 영상 https://www.youtube.com/watch?v=9d2m0VUsnSk 을 보세요.

인라인 코드: `https://www.youtube.com/watch?v=9d2m0VUsnSk`

인라인 코드 바로 뒤에 붙은 주소:

`영상`https://youtu.be/9d2m0VUsnSk

코드 블록 안의 단독 줄:

```
https://www.youtube.com/watch?v=9d2m0VUsnSk
```

~~~text
https://youtu.be/9d2m0VUsnSk
~~~

목록과 인용 안의 주소:

- https://youtu.be/9d2m0VUsnSk

> https://youtu.be/9d2m0VUsnSk

들여쓴 주소 (코드 블록으로 해석돼요):

    https://youtu.be/9d2m0VUsnSk

ID 형식이 틀린 주소와 다른 사이트 주소:

https://youtu.be/short

https://www.youtube.com/watch?v=abc

https://vimeo.com/123456789

https://www.youtube.com/channel/UCxxxxxxxxxxxxxxxxxxxxxx

수식 블록 안의 줄:

$$
x
https://youtu.be/9d2m0VUsnSk
$$

## 마무리

제목이 3개 이상이라 목차도 같이 나와야 해요.
