import { BannerBlock } from '@/blocks/Banner/Component'
import { CallToActionBlock } from '@/blocks/CallToAction/Component'
import { CodeBlock, CodeBlockProps } from '@/blocks/Code/Component'
import { MediaBlock } from '@/blocks/MediaBlock/Component'
import React, { Fragment, JSX } from 'react'
import { CMSLink } from '@/components/Link'
import {
  DefaultNodeTypes,
  SerializedBlockNode,
  SerializedTableCellNode,
  SerializedTableNode,
  SerializedTableRowNode,
} from '@payloadcms/richtext-lexical'
import type { BannerBlock as BannerBlockProps } from '@/payload-types'

import {
  IS_BOLD,
  IS_CODE,
  IS_ITALIC,
  IS_STRIKETHROUGH,
  IS_SUBSCRIPT,
  IS_SUPERSCRIPT,
  IS_UNDERLINE,
} from './nodeFormat'
import type {
  CallToActionBlock as CTABlockProps,
  MediaBlock as MediaBlockProps,
} from '@/payload-types'

// The table nodes are not in `DefaultNodeTypes`: the table feature is still
// experimental, so its node types ship separately even though the feature is
// registered on posts.content.
export type NodeTypes =
  | DefaultNodeTypes
  | SerializedTableNode
  | SerializedBlockNode<CTABlockProps | MediaBlockProps | BannerBlockProps | CodeBlockProps>

type Props = {
  nodes: NodeTypes[]
}

export function serializeLexical({ nodes }: Props): JSX.Element {
  return (
    <Fragment>
      {nodes?.map((node, index): JSX.Element | null => {
        if (node == null) {
          return null
        }

        if (node.type === 'text') {
          let text = <React.Fragment key={index}>{node.text}</React.Fragment>
          if (node.format & IS_BOLD) {
            text = <strong key={index}>{text}</strong>
          }
          if (node.format & IS_ITALIC) {
            text = <em key={index}>{text}</em>
          }
          if (node.format & IS_STRIKETHROUGH) {
            text = (
              <span key={index} style={{ textDecoration: 'line-through' }}>
                {text}
              </span>
            )
          }
          if (node.format & IS_UNDERLINE) {
            text = (
              <span key={index} style={{ textDecoration: 'underline' }}>
                {text}
              </span>
            )
          }
          if (node.format & IS_CODE) {
            text = <code key={index}>{node.text}</code>
          }
          if (node.format & IS_SUBSCRIPT) {
            text = <sub key={index}>{text}</sub>
          }
          if (node.format & IS_SUPERSCRIPT) {
            text = <sup key={index}>{text}</sup>
          }

          return text
        }

        // NOTE: Hacky fix for
        // https://github.com/facebook/lexical/blob/d10c4e6e55261b2fdd7d1845aed46151d0f06a8c/packages/lexical-list/src/LexicalListItemNode.ts#L133
        // which does not return checked: false (only true - i.e. there is no prop for false)
        const serializedChildrenFn = (currentNode: {
          type?: string
          listType?: string
          children?: unknown[]
        }): JSX.Element | null => {
          if (!Array.isArray(currentNode.children)) {
            return null
          } else {
            if (currentNode.type === 'list' && currentNode.listType === 'check') {
              for (const item of currentNode.children) {
                if (item && typeof item === 'object' && 'checked' in item) {
                  const checkItem = item as { checked?: boolean }
                  if (!checkItem.checked) {
                    checkItem.checked = false
                  }
                }
              }
            }
            return serializeLexical({ nodes: currentNode.children as NodeTypes[] })
          }
        }

        const serializedChildren =
          'children' in node ? serializedChildrenFn(node as { children?: unknown[] }) : ''

        if (node.type === 'block') {
          const block = node.fields

          const blockType = block?.blockType

          if (!block || !blockType) {
            return null
          }

          switch (blockType) {
            case 'cta':
              return <CallToActionBlock key={index} {...block} />
            case 'mediaBlock':
              return (
                <MediaBlock
                  className="col-start-1 col-span-3"
                  imgClassName="m-0"
                  key={index}
                  {...block}
                  captionClassName="mx-auto max-w-[48rem]"
                  enableGutter={false}
                  disableInnerContainer={true}
                />
              )
            case 'banner':
              return <BannerBlock className="col-start-2 mb-4" key={index} {...block} />
            case 'code':
              return <CodeBlock className="col-start-2" key={index} {...block} />
            default:
              return null
          }
        } else {
          switch (node.type) {
            case 'linebreak': {
              return <br className="col-start-2" key={index} />
            }
            case 'paragraph': {
              return (
                <p className="col-start-2" key={index}>
                  {serializedChildren}
                </p>
              )
            }
            case 'heading': {
              const Tag = node?.tag
              return (
                <Tag className="col-start-2" key={index}>
                  {serializedChildren}
                </Tag>
              )
            }
            case 'list': {
              const Tag = node?.tag
              return (
                <Tag className="list col-start-2" key={index}>
                  {serializedChildren}
                </Tag>
              )
            }
            case 'listitem': {
              if (node?.checked != null) {
                return (
                  <li
                    aria-checked={node.checked ? 'true' : 'false'}
                    className={` ${node.checked ? '' : ''}`}
                    key={index}
                    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role
                    role="checkbox"
                    tabIndex={-1}
                    value={node?.value}
                  >
                    {serializedChildren}
                  </li>
                )
              } else {
                return (
                  <li key={index} value={node?.value}>
                    {serializedChildren}
                  </li>
                )
              }
            }
            case 'quote': {
              return (
                <blockquote className="col-start-2" key={index}>
                  {serializedChildren}
                </blockquote>
              )
            }
            case 'table': {
              // Mirrors the `table`/`tableRow` pair in src/lib/articleHtml.ts,
              // which renders the same Lexical tree as the HTML string the
              // static site splices in. Two implementations of one algorithm
              // drift, so the rules are kept identical: headerState picks th
              // over td, a row whose cells are all header cells belongs to
              // thead, and an empty section is omitted rather than rendered.
              //
              // Rows and cells are walked here instead of being handed back to
              // the switch above, because `tablerow` and `tablecell` have no
              // cases there and would come back as null.
              const rows = (node.children ?? []) as SerializedTableRowNode[]
              const cellsOf = (row: SerializedTableRowNode) =>
                (row.children ?? []) as SerializedTableCellNode[]
              const isHeaderRow = (row: SerializedTableRowNode) =>
                cellsOf(row).length > 0 && cellsOf(row).every((cell) => (cell.headerState ?? 0) > 0)

              const renderRow = (row: SerializedTableRowNode, rowIndex: number) => (
                <tr key={rowIndex}>
                  {cellsOf(row).map((cell, cellIndex) => {
                    const Cell = (cell.headerState ?? 0) > 0 ? 'th' : 'td'
                    // A cell holds paragraphs; they are unwrapped so the cell
                    // reads inline rather than nesting a <p> in every box.
                    // Only `paragraph` is unwrapped, not anything with
                    // children: a list in a cell has to keep its ul/ol, and
                    // unwrapping it would drop the wrapper and leave loose
                    // <li>s. Anything else goes through the switch as usual,
                    // which is a small, deliberate improvement on articleHtml
                    // — it unwraps every child and would flatten such a list.
                    const cellChildren = (cell.children ?? []).flatMap((child) => {
                      const wrapper = child as { type?: string; children?: unknown[] }
                      return wrapper.type === 'paragraph' && Array.isArray(wrapper.children)
                        ? wrapper.children
                        : [child]
                    })
                    return (
                      <Cell key={cellIndex}>
                        {serializeLexical({ nodes: cellChildren as NodeTypes[] })}
                      </Cell>
                    )
                  })}
                </tr>
              )

              const headerRows = rows.filter(isHeaderRow)
              const bodyRows = rows.filter((row) => !isHeaderRow(row))

              return (
                // `table-scroll` keeps the class the static site's markup
                // carries; `overflow-x-auto` is what actually makes a wide
                // table scroll here, because this app styles the table itself
                // but has no rule for the wrapper.
                <div className="table-scroll col-start-2 overflow-x-auto" key={index}>
                  <table>
                    {headerRows.length > 0 && <thead>{headerRows.map(renderRow)}</thead>}
                    {bodyRows.length > 0 && <tbody>{bodyRows.map(renderRow)}</tbody>}
                  </table>
                </div>
              )
            }
            case 'horizontalrule': {
              return <hr className="col-start-2" key={index} />
            }
            // An `autolink` is a bare URL the editor linkified. It is a
            // different node type from `link` but carries the same `url`
            // field, so it renders the same way — as articleHtml.ts already
            // treats the two.
            case 'autolink':
            case 'link': {
              const fields = node.fields

              return (
                <CMSLink
                  key={index}
                  newTab={Boolean(fields?.newTab)}
                  reference={fields.doc as any}
                  type={fields.linkType === 'internal' ? 'reference' : 'custom'}
                  url={fields.url}
                >
                  {serializedChildren}
                </CMSLink>
              )
            }

            default:
              return null
          }
        }
      })}
    </Fragment>
  )
}
