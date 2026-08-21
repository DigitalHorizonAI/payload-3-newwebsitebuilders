import React from 'react'

import { Card, CardPostData } from '@/components/Card'
import { Reveal } from '@/components/Motion/Reveal'

export type Props = {
  posts: CardPostData[]
}

/** The main site's article grid: three columns of bare cards, wide gutters. */
export const CollectionArchive: React.FC<Props> = (props) => {
  const { posts } = props

  return (
    <div className="container">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
        {posts?.map((result, index) => {
          if (typeof result === 'object' && result !== null) {
            return (
              <Reveal className="flex" delay={index} key={index}>
                <Card className="h-full w-full" doc={result} relationTo="posts" showCategories />
              </Reveal>
            )
          }

          return null
        })}
      </div>
    </div>
  )
}
